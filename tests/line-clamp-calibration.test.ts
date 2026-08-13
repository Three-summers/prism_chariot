import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCalibrationData, parseCalibrationRecord } from '../src/lineClamp/calibration.ts'

test('normalizes a reference calibration record', () => {
  const record = parseCalibrationRecord('frame.jpg', {
    box_corners: [[785, 362], [507, 192], [785, 192], [507, 362]],
    box_center: [646, 277],
    box_size: [278, 170],
    has_screw: false,
    screw_pos: [648, 275],
  })
  assert.deepEqual(record, {
    filename: 'frame.jpg',
    box: { x: 507, y: 192, width: 278, height: 170 },
    screw: { x: 648, y: 275, expected: false },
  })
})

test('parses a calibration object keyed by basename', () => {
  const result = parseCalibrationData({
    '/tmp/frame.jpg': {
      box_corners: [[0, 0], [10, 0], [10, 5], [0, 5]],
      box_center: [5, 2.5],
      box_size: [10, 5],
      has_screw: true,
      screw_pos: [5, 2],
    },
  })
  assert.deepEqual(result.get('frame.jpg')?.box, { x: 0, y: 0, width: 10, height: 5 })
  assert.equal(result.get('frame.jpg')?.screw.expected, true)
})

test('rejects malformed calibration records', () => {
  assert.throws(() => parseCalibrationRecord('bad.jpg', { box_size: [10, 5] }), /calibration/i)
  assert.throws(() => parseCalibrationRecord('bad.jpg', {
    box_corners: [[0, 0], [10, 0], [10, 5], [0, 5]],
    box_center: [5, 2.5],
    box_size: [10, 5],
    has_screw: 'yes',
    screw_pos: [5, 2],
  }), /calibration/i)
})
