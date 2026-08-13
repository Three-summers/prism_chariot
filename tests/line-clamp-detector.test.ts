import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { LineClampDetector, classifyLineClampStatus } from '../src/lineClamp/detector.ts'
import type { LineClampCalibration } from '../src/lineClamp/types.ts'

function makeImage(width = 640, height = 480): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 220
    data[index + 1] = 220
    data[index + 2] = 220
    data[index + 3] = 255
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData
}

function paintRect(image: ImageData, centerX: number, centerY: number, width: number, height: number, angleDeg = 0, screw = true) {
  const { data, width: imageWidth, height: imageHeight } = image
  const angle = angleDeg * Math.PI / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  for (let y = 0; y < imageHeight; y += 1) {
    for (let x = 0; x < imageWidth; x += 1) {
      const dx = x - centerX
      const dy = y - centerY
      const localX = dx * cos + dy * sin
      const localY = -dx * sin + dy * cos
      if (Math.abs(localX) <= width / 2 && Math.abs(localY) <= height / 2) {
        const offset = (y * imageWidth + x) * 4
        data[offset] = 35
        data[offset + 1] = 35
        data[offset + 2] = 35
      }
    }
  }
  if (screw) {
    for (let y = centerY - 8; y <= centerY + 8; y += 1) {
      for (let x = centerX - 8; x <= centerX + 8; x += 1) {
        if ((x - centerX) ** 2 + (y - centerY) ** 2 <= 8 ** 2) {
          const offset = (y * imageWidth + x) * 4
          data[offset] = 230
          data[offset + 1] = 230
          data[offset + 2] = 230
        }
      }
    }
  }
}

const detector = new LineClampDetector()

test('detects a centered clamp and bright screw in an uncalibrated image', () => {
  const image = makeImage()
  paintRect(image, 320, 240, 270, 170, 0, true)

  const result = detector.detect({ image, filename: 'synthetic-ok.png' })

  assert.equal(result.success, true)
  assert.equal(result.hasScrew, true)
  assert.equal(result.isTilted, false)
  assert.equal(result.status, 'ok')
  assert.ok(Math.abs(result.center.x - 320) <= 5)
  assert.ok(Math.abs(result.center.y - 240) <= 5)
  assert.ok(result.screwContrast > 12)
  assert.ok(result.box)
})

test('classifies missing screw separately from a valid clamp', () => {
  const image = makeImage()
  paintRect(image, 320, 240, 270, 170, 0, false)

  const result = detector.detect({ image, filename: 'synthetic-no-screw.png' })

  assert.equal(result.success, true)
  assert.equal(result.hasScrew, false)
  assert.equal(result.status, 'no-screw')
  assert.equal(classifyLineClampStatus({ ...result, isTilted: false, hasScrew: false }), 'no-screw')
})

test('reports a rotated clamp as tilted', () => {
  const image = makeImage()
  paintRect(image, 320, 240, 270, 170, 12, true)

  const result = detector.detect({ image, filename: 'synthetic-tilted.png' })

  assert.equal(result.success, true)
  assert.equal(result.hasScrew, true)
  assert.equal(result.isTilted, true)
  assert.equal(result.status, 'tilted')
  assert.ok(Math.abs(result.angleDeg) > 3)
})

test('uses calibration screw expectation when a matching record exists', () => {
  const image = makeImage(360, 260)
  paintRect(image, 180, 130, 170, 100, 0, true)
  const calibration: LineClampCalibration = {
    filename: 'calibrated.png',
    box: { x: 90, y: 75, width: 180, height: 110 },
    screw: { x: 180, y: 130, expected: false },
  }

  const result = detector.detect({ image, filename: 'calibrated.png', calibration })

  assert.equal(result.success, true)
  assert.equal(result.hasScrew, false)
  assert.equal(result.status, 'no-screw')
  assert.deepEqual(result.box, calibration.box)
  assert.deepEqual(result.center, { x: 180, y: 130 })
  assert.equal(result.area, 19_800)
})

test('returns a failed result when no candidate survives', () => {
  const result = detector.detect({ image: makeImage(), filename: 'empty.png' })

  assert.equal(result.success, false)
  assert.equal(result.status, 'failed')
  assert.equal(result.box, null)
  assert.ok(result.error)
})

test('rejects dark components far below the calibrated clamp area', () => {
  const image = makeImage()
  paintRect(image, 320, 240, 40, 20, 0, true)

  const result = detector.detect({ image, filename: 'small-dark-object.png' })

  assert.equal(result.success, false)
  assert.equal(result.status, 'failed')
})

test('rejects low-extent frame-shaped components with a clamp-like area', () => {
  const image = makeImage()
  const { data, width } = image
  for (let y = 40; y < 440; y += 1) {
    for (let x = 120; x < 520; x += 1) {
      const border = x < 150 || x >= 490 || y < 70 || y >= 410
      if (!border) continue
      const offset = (y * width + x) * 4
      data[offset] = 35
      data[offset + 1] = 35
      data[offset + 2] = 35
    }
  }

  const result = detector.detect({ image, filename: 'low-extent-frame.png' })

  assert.equal(result.success, false)
  assert.equal(result.status, 'failed')
})

test('matches the four reference status golden fixtures', () => {
  for (const name of ['ok', 'no-screw', 'tilted', 'tilted-no-screw']) {
    const fixture = JSON.parse(readFileSync(new URL(`./fixtures/line-clamp/${name}.json`, import.meta.url), 'utf8')) as {
      status: 'ok' | 'no-screw' | 'tilted' | 'tilted-no-screw'
      success: boolean
      hasScrew: boolean
      isTilted: boolean
    }
    assert.equal(classifyLineClampStatus(fixture), fixture.status)
  }
})
