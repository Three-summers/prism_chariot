import assert from 'node:assert/strict'
import test from 'node:test'
import { MagneticPlateDetector } from '../src/magneticPlate/detector.ts'

interface SyntheticImage extends ImageData {
  data: Uint8ClampedArray
}

function makeImage(width = 200, height = 120): SyntheticImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 18
    data[index + 1] = 20
    data[index + 2] = 19
    data[index + 3] = 255
  }
  return { data, width, height, colorSpace: 'srgb' } as SyntheticImage
}

function paintRect(image: SyntheticImage, x: number, y: number, width: number, height: number, value = 245): void {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const offset = (py * image.width + px) * 4
      image.data[offset] = value
      image.data[offset + 1] = value
      image.data[offset + 2] = value
    }
  }
}

function paintPixel(image: SyntheticImage, x: number, y: number, value = 245): void {
  const offset = (y * image.width + x) * 4
  image.data[offset] = value
  image.data[offset + 1] = value
  image.data[offset + 2] = value
}

const detector = new MagneticPlateDetector()

test('classifies one continuous lower-left horizontal stripe as normal', () => {
  const image = makeImage()
  paintRect(image, 12, 78, 112, 5)

  const result = detector.detect(image)

  assert.equal(result.status, 'normal')
  assert.equal(result.segments.length, 1)
  assert.equal(result.gapPx, 0)
  assert.ok(result.continuity > 0.8)
})

test('classifies two significant stripe segments separated at the center as warped', () => {
  const image = makeImage()
  paintRect(image, 12, 78, 47, 5)
  paintRect(image, 72, 79, 52, 5)

  const result = detector.detect(image)

  assert.equal(result.status, 'warped')
  assert.equal(result.segments.length, 2)
  assert.ok(result.gapPx >= 12 && result.gapPx <= 14)
  assert.ok(result.continuity < 0.9)
})

test('classifies vertically shifted stripe segments as warped', () => {
  const image = makeImage()
  paintRect(image, 12, 78, 51, 5)
  paintRect(image, 66, 87, 58, 5)

  const result = detector.detect(image)

  assert.equal(result.status, 'warped')
  assert.equal(result.segments.length, 2)
  assert.ok(result.centerJumpPx >= 8)
})

test('detects a center-line break even when glare bridges both stripe segments', () => {
  const image = makeImage()
  paintRect(image, 12, 78, 55, 5)
  paintRect(image, 70, 66, 54, 5)
  for (let step = 0; step <= 12; step += 1) paintPixel(image, 64 + step, 80 - step)

  const result = detector.detect(image)

  assert.equal(result.status, 'warped')
  assert.equal(result.segments.length, 2)
  assert.ok(result.centerJumpPx >= 8)
})

test('preserves a local bridged break when the segment-wide center averages are close', () => {
  const image = makeImage(200, 240)
  paintRect(image, 12, 158, 55, 5)
  paintRect(image, 70, 146, 18, 5)
  paintRect(image, 96, 158, 28, 5)
  for (let step = 0; step <= 12; step += 1) paintPixel(image, 64 + step, 160 - step)
  for (let step = 0; step <= 12; step += 1) paintPixel(image, 84 + step, 148 + step)

  const result = detector.detect(image)

  assert.equal(result.status, 'warped')
  assert.equal(result.segments.length, 2)
})

test('ignores a right-side vertical reflection beside a valid stripe', () => {
  const image = makeImage()
  paintRect(image, 12, 78, 112, 5)
  paintRect(image, 150, 58, 7, 44)

  const result = detector.detect(image)

  assert.equal(result.status, 'normal')
  assert.equal(result.segments.length, 1)
  assert.ok(result.segments[0].width > 0.5)
})

test('fails when the image contains only reflection or no bright target', () => {
  const reflection = makeImage()
  paintRect(reflection, 150, 58, 7, 44)

  for (const image of [reflection, makeImage()]) {
    const result = detector.detect(image)
    assert.equal(result.status, 'failed')
    assert.equal(result.segments.length, 0)
    assert.ok(result.error)
  }
})
