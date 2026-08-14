import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyDeviation, detectLineProtrusion, findSpotsOnLine } from '../src/lineProtrusion/detector.ts'
import type { LineProtrusionConfig, WireCalibration } from '../src/lineProtrusion/types.ts'

interface TestImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

function makeDarkImage(width: number, height: number): TestImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 3; index < data.length; index += 4) data[index] = 255
  return { data, width, height }
}

function paintSpot(image: TestImage, centerX: number, centerY: number, brightness: number): void {
  for (let y = centerY - 2; y <= centerY + 2; y += 1) {
    for (let x = centerX - 2; x <= centerX + 2; x += 1) {
      const offset = (y * image.width + x) * 4
      image.data[offset] = brightness
      image.data[offset + 1] = brightness
      image.data[offset + 2] = brightness
    }
  }
}

test('finds one brightness centroid in each third of a horizontal scan band', () => {
  const image = makeDarkImage(300, 120)
  paintSpot(image, 50, 60, 255)
  paintSpot(image, 150, 60, 220)
  paintSpot(image, 250, 60, 240)

  const spots = findSpotsOnLine(image, 60, 0, 299)

  assert.deepEqual(spots?.map((spot) => ({ x: Math.round(spot.x), y: Math.round(spot.y) })), [
    { x: 50, y: 60 },
    { x: 150, y: 60 },
    { x: 250, y: 60 },
  ])
})

const config: LineProtrusionConfig = { warningDeg: 2, alarmDeg: 5, sensitivity: 1 }

function calibrationAtY(width: number, height: number, y: number): WireCalibration {
  return {
    wire: 0,
    spots: [
      { x: 50 / width, y: y / height },
      { x: 150 / width, y: y / height },
      { x: 250 / width, y: y / height },
    ],
  }
}

function frameWithMiddleAt(middleY: number): TestImage {
  const image = makeDarkImage(300, 200)
  paintSpot(image, 50, 100, 255)
  paintSpot(image, 150, middleY, 255)
  paintSpot(image, 250, 100, 255)
  return image
}

test('tracks the middle spot and classifies warning and alarm thresholds', () => {
  const calibration = calibrationAtY(300, 200, 100)

  const warning = detectLineProtrusion(frameWithMiddleAt(103), [calibration], config)
  const alarm = detectLineProtrusion(frameWithMiddleAt(106), [calibration], config)

  assert.equal(warning.wires[0].state, 'warning')
  assert.equal(Math.round(warning.wires[0].deviationDeg), 3)
  assert.equal(warning.state, 'warning')
  assert.equal(alarm.wires[0].state, 'alarm')
  assert.equal(Math.round(alarm.wires[0].deviationDeg), 6)
  assert.equal(alarm.state, 'alarm')
})

test('classifies exact thresholds and applies sensitivity', () => {
  assert.equal(classifyDeviation(1.99, config), 'ok')
  assert.equal(classifyDeviation(-2, config), 'warning')
  assert.equal(classifyDeviation(5, config), 'alarm')

  const result = detectLineProtrusion(frameWithMiddleAt(103), [calibrationAtY(300, 200, 100)], { ...config, sensitivity: 2 })
  assert.equal(Math.round(result.wires[0].deviationDeg), 6)
  assert.equal(result.state, 'alarm')
})
