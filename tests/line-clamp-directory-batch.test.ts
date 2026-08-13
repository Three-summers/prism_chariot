import assert from 'node:assert/strict'
import test from 'node:test'
import { LineClampBatchController, naturalSortImages, type DirectoryImage } from '../src/lineClamp/directoryBatch.ts'

function image(relativePath: string): DirectoryImage {
  return { relativePath, file: new Blob([relativePath], { type: 'image/jpeg' }) }
}

test('naturally sorts directory images by relative path', () => {
  const sorted = naturalSortImages([image('b/image_10.jpg'), image('a/image_2.jpg'), image('a/image_10.jpg')])
  assert.deepEqual(sorted.map((item) => item.relativePath), ['a/image_2.jpg', 'a/image_10.jpg', 'b/image_10.jpg'])
})

test('processes every image in order and reports the last frame as complete', async () => {
  const frames: string[] = []
  const progress: Array<[number, number]> = []
  const controller = new LineClampBatchController({ sleep: async () => undefined })

  await controller.run([image('image_10.jpg'), image('image_2.jpg')], async (item) => item.relativePath, {
    onFrame: (item, result) => frames.push(`${item.relativePath}:${result}`),
    onProgress: (current, total) => progress.push([current, total]),
  })

  assert.deepEqual(frames, ['image_2.jpg:image_2.jpg', 'image_10.jpg:image_10.jpg'])
  assert.deepEqual(progress.at(-1), [2, 2])
  assert.equal(controller.status, 'completed')
})

test('pause blocks the next image until resume and stop preserves the current frame', async () => {
  let releaseFirst!: () => void
  const processed: string[] = []
  const controller = new LineClampBatchController({ sleep: async () => undefined })
  const running = controller.run([image('1.jpg'), image('2.jpg'), image('3.jpg')], async (item) => {
    processed.push(item.relativePath)
    if (item.relativePath === '1.jpg') await new Promise<void>((resolve) => { releaseFirst = resolve })
    return item.relativePath
  }, { onFrame: () => undefined, onProgress: () => undefined })

  await Promise.resolve()
  controller.pause()
  releaseFirst()
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(processed, ['1.jpg'])
  controller.resume()
  await Promise.resolve()
  controller.stop()
  await running

  assert.ok(processed.length < 3)
  assert.equal(controller.status, 'stopped')
})
