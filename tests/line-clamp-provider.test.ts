import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_MEDIA } from '../src/config/defaultMedia.ts'
import { LineClampDataProvider } from '../src/lineClamp/lineClampDataProvider.ts'
import type { LineClampImageData } from '../src/lineClamp/types.ts'

function syntheticClamp(): LineClampImageData {
  const width = 640
  const height = 480
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dark = x >= 185 && x <= 455 && y >= 155 && y <= 325
      const offset = (y * width + x) * 4
      data[offset] = dark ? 35 : 220
      data[offset + 1] = dark ? 35 : 220
      data[offset + 2] = dark ? 35 : 220
      data[offset + 3] = 255
    }
  }
  return { data, width, height }
}

test('loads the configured line-clamp image when no upload is provided', async () => {
  let requestedUrl = ''
  const provider = new LineClampDataProvider({
    decode: async () => syntheticClamp(),
    createSourceUrl: () => 'blob:unused',
    revokeSourceUrl: () => undefined,
    loadSample: async (sourceUrl: string) => {
      requestedUrl = sourceUrl
      return new Blob(['default-image'])
    },
  })

  const dashboard = await provider.getDashboard()

  assert.equal(requestedUrl, DEFAULT_MEDIA.lineClamp.src)
  assert.equal(dashboard.media.src, DEFAULT_MEDIA.lineClamp.src)
})

test('decodes input and returns a real line-clamp image view model', async () => {
  const provider = new LineClampDataProvider({
    decode: async () => syntheticClamp(),
    createSourceUrl: () => 'blob:uploaded-clamp',
    revokeSourceUrl: () => undefined,
  })

  const dashboard = await provider.getDashboard({ file: new Blob(['image']), filename: 'uploaded.jpg' })

  assert.equal(dashboard.moduleId, 'lineClamp')
  assert.equal(dashboard.media.kind, 'image')
  assert.equal(dashboard.media.src, 'blob:uploaded-clamp')
  assert.ok(dashboard.media.detectionBox)
})

test('revokes the previous uploaded object URL when replacing the input', async () => {
  const revoked: string[] = []
  let sequence = 0
  const provider = new LineClampDataProvider({
    decode: async () => syntheticClamp(),
    createSourceUrl: () => `blob:clamp-${++sequence}`,
    revokeSourceUrl: (url) => revoked.push(url),
  })

  await provider.getDashboard({ file: new Blob(['first']), filename: 'first.jpg' })
  await provider.getDashboard({ file: new Blob(['second']), filename: 'second.jpg' })

  assert.deepEqual(revoked, ['blob:clamp-1'])
  provider.dispose()
  assert.deepEqual(revoked, ['blob:clamp-1', 'blob:clamp-2'])
})

test('a stale request cannot replace or revoke the latest uploaded image URL', async () => {
  const revoked: string[] = []
  const pendingDecodes: Array<(image: LineClampImageData) => void> = []
  const pendingUrls: Array<(url: string) => void> = []
  const provider = new LineClampDataProvider({
    decode: () => new Promise((resolve) => pendingDecodes.push(resolve)),
    createSourceUrl: () => new Promise((resolve) => pendingUrls.push(resolve)),
    revokeSourceUrl: (url) => revoked.push(url),
  })

  const first = provider.getDashboard({ file: new Blob(['first']), filename: 'first.jpg' })
  await Promise.resolve()
  await Promise.resolve()
  pendingDecodes[0](syntheticClamp())
  await Promise.resolve()
  await Promise.resolve()

  const second = provider.getDashboard({ file: new Blob(['second-image']), filename: 'second.jpg' })
  await Promise.resolve()
  await Promise.resolve()
  pendingDecodes[1](syntheticClamp())
  await Promise.resolve()
  await Promise.resolve()
  pendingUrls[1]('blob:second')
  const latest = await second
  pendingUrls[0]('blob:first')
  await first

  assert.equal(latest.media.src, 'blob:second')
  assert.deepEqual(revoked, ['blob:first'])
  provider.dispose()
  assert.deepEqual(revoked, ['blob:first', 'blob:second'])
})
