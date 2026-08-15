import assert from 'node:assert/strict'
import test from 'node:test'
import { LifeSensingCaseTracker } from '../src/lifeSensing/caseTracker.ts'
import type { LifeState, PersonSnapshot } from '../src/lifeSensing/types.ts'

function person(id: number, state: LifeState): PersonSnapshot {
  return {
    id,
    position: { x: id, y: 3, z: 0.8 },
    speed: 0,
    height: state === 'fallen' ? 0.7 : 1.7,
    confidence: 0.95,
    rangeBin: 20,
    breathDeviation: 0.1,
    heartRate: 72,
    breathRate: 16,
    heartWaveform: [],
    breathWaveform: [],
    trajectory: [],
    state,
    lastSeenAtMs: 0,
  }
}

test('creates cases on anomaly entry and escalation but not persistence', () => {
  const tracker = new LifeSensingCaseTracker()

  assert.equal(tracker.update([person(1, 'motionless')], '2026-08-14 10:00:00').length, 1)
  assert.equal(tracker.update([person(1, 'motionless')], '2026-08-14 10:00:01').length, 0)
  assert.equal(tracker.update([person(1, 'fallen')], '2026-08-14 10:00:02').length, 1)
  assert.equal(tracker.update([person(1, 'vitalsAbnormal')], '2026-08-14 10:00:03').length, 0)
  tracker.update([person(1, 'normal')], '2026-08-14 10:00:04')
  assert.equal(tracker.update([person(1, 'motionless')], '2026-08-14 10:00:05').length, 1)

  assert.equal(tracker.cases().length, 3)
  assert.deepEqual(tracker.cases().map((item) => item.id), ['LIF-0001', 'LIF-0002', 'LIF-0003'])
  assert.equal(tracker.cases()[1].color, 'red')
})

test('tracks active anomaly severity independently for each person', () => {
  const tracker = new LifeSensingCaseTracker()

  const created = tracker.update([person(1, 'motionless'), person(2, 'breathHold')], '2026-08-14 10:00:00')
  assert.equal(created.length, 2)
  assert.deepEqual(created.map((item) => item.spot), ['LIT-086 / P1', 'LIT-086 / P2'])
  assert.equal(tracker.update([person(1, 'motionless'), person(2, 'fallen')], '2026-08-14 10:00:01').length, 1)
})

test('retains only the latest 50 cases', () => {
  const tracker = new LifeSensingCaseTracker()
  for (let index = 0; index < 55; index += 1) {
    tracker.update([person(1, 'normal')], `2026-08-14 10:00:${String(index).padStart(2, '0')}`)
    tracker.update([person(1, 'motionless')], `2026-08-14 10:01:${String(index).padStart(2, '0')}`)
  }

  const cases = tracker.cases()
  assert.equal(cases.length, 50)
  assert.equal(cases[0].id, 'LIF-0006')
  assert.equal(cases[49].id, 'LIF-0055')
})
