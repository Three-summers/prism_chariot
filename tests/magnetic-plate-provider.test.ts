import assert from 'node:assert/strict'
import test from 'node:test'
import { MagneticPlateDataProvider } from '../src/magneticPlate/magneticPlateDataProvider.ts'
import type { MagneticPlateImageData } from '../src/magneticPlate/types.ts'

function stripedImage(): MagneticPlateImageData {
  const width = 200
  const height = 120
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const bright = y >= 78 && y < 83 && x >= 12 && x < 124
      const offset = (y * width + x) * 4
      data[offset] = bright ? 245 : 18
      data[offset + 1] = bright ? 245 : 20
      data[offset + 2] = bright ? 245 : 19
      data[offset + 3] = 255
    }
  }
  return { data, width, height }
}

test('returns neutral data before an image is selected and real image data after inspection', async () => {
  const provider = new MagneticPlateDataProvider({
    decode: async () => stripedImage(),
    createSourceUrl: () => 'blob:plate',
    revokeSourceUrl: () => undefined,
  })

  const initial = await provider.getDashboard()
  const inspected = await provider.inspect(new Blob(['plate']))

  assert.equal(initial.moduleId, 'magneticPlate')
  assert.equal(initial.media.kind, undefined)
  assert.equal(initial.cases.length, 0)
  assert.equal(inspected.detection.status, 'normal')
  assert.equal(inspected.viewModel.media.kind, 'image')
  assert.equal(inspected.viewModel.media.src, 'blob:plate')
})
test('revokes the previous object URL on replacement and the active URL on dispose', async () => {
  const revoked: string[] = []
  let sequence = 0
  const provider = new MagneticPlateDataProvider({
    decode: async () => stripedImage(),
    createSourceUrl: () => `blob:plate-${++sequence}`,
    revokeSourceUrl: (url) => revoked.push(url),
  })

  await provider.inspect(new Blob(['first']))
  await provider.inspect(new Blob(['second']))
  assert.deepEqual(revoked, ['blob:plate-1'])

  provider.dispose()
  assert.deepEqual(revoked, ['blob:plate-1', 'blob:plate-2'])
})

test('a stale request cannot replace or revoke the latest image URL', async () => {
  const revoked: string[] = []
  const decodes: Array<(image: MagneticPlateImageData) => void> = []
  const urls: Array<(url: string) => void> = []
  const provider = new MagneticPlateDataProvider({
    decode: () => new Promise((resolve) => decodes.push(resolve)),
    createSourceUrl: () => new Promise((resolve) => urls.push(resolve)),
    revokeSourceUrl: (url) => revoked.push(url),
  })

  const first = provider.inspect(new Blob(['first']))
  await Promise.resolve()
  await Promise.resolve()
  decodes[0](stripedImage())
  await Promise.resolve()
  await Promise.resolve()

  const second = provider.inspect(new Blob(['second']))
  await Promise.resolve()
  await Promise.resolve()
  decodes[1](stripedImage())
  await Promise.resolve()
  await Promise.resolve()
  urls[1]('blob:latest')
  const latest = await second
  urls[0]('blob:stale')
  await first

  assert.equal(latest.viewModel.media.src, 'blob:latest')
  assert.deepEqual(revoked, ['blob:stale'])
  provider.dispose()
  assert.deepEqual(revoked, ['blob:stale', 'blob:latest'])
})
