import assert from 'node:assert/strict'
import test from 'node:test'
import { LineProtrusionCaseTracker } from '../src/lineProtrusion/caseTracker.ts'
import type { LineProtrusionDetectionResult, WireState } from '../src/lineProtrusion/types.ts'

const spots = [
  { x: 0.2, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 0.8, y: 0.5 },
] as const

function result(state: WireState): LineProtrusionDetectionResult {
  return {
    width: 1280,
    height: 720,
    state,
    wires: [{
      wire: 0,
      spots: [...spots],
      deviationDeg: state === 'alarm' ? 6 : state === 'warning' ? 3 : 0,
      state,
    }],
  }
}

test('emits cases only when a wire enters or escalates an anomaly', () => {
  const tracker = new LineProtrusionCaseTracker('LIT-118')

  assert.equal(tracker.next(result('warning'), '2026-08-14 10:00:00').length, 1)
  assert.equal(tracker.next(result('warning'), '2026-08-14 10:00:01').length, 0)
  assert.equal(tracker.next(result('alarm'), '2026-08-14 10:00:02').length, 1)
  assert.equal(tracker.next(result('warning'), '2026-08-14 10:00:03').length, 0)
  assert.equal(tracker.next(result('ok'), '2026-08-14 10:00:04').length, 0)
  assert.equal(tracker.next(result('warning'), '2026-08-14 10:00:05').length, 1)
})

test('maps warning and alarm transitions to distinct real CASE semantics', () => {
  const tracker = new LineProtrusionCaseTracker('LIT-118')
  const warning = tracker.next(result('warning'), '2026-08-14 10:00:00')[0]
  const alarm = tracker.next(result('alarm'), '2026-08-14 10:00:02')[0]

  assert.equal(warning.id, 'LPR-0001')
  assert.equal(warning.color, 'orange')
  assert.equal(warning.typeKey, 'event.lineProtrusionWarning')
  assert.equal(warning.spot, 'LIT-118 / W1')
  assert.equal(alarm.id, 'LPR-0002')
  assert.equal(alarm.color, 'red')
  assert.equal(alarm.typeKey, 'event.lineProtrusionAlarm')
})
