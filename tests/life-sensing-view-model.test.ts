import assert from 'node:assert/strict'
import test from 'node:test'
import { mockDashboardDataProvider } from '../src/data/DashboardDataProvider.ts'
import { mapLifeSensingSnapshot } from '../src/lifeSensing/lifeSensingViewModel.ts'
import type { LifeSensingSnapshot, PersonSnapshot } from '../src/lifeSensing/types.ts'

function person(id: number, heartRate: number, breathRate: number, waveform: number): PersonSnapshot {
  return {
    id,
    position: { x: id === 1 ? -0.5 : 1.2, y: id === 1 ? 2.5 : 3.6, z: 0.8 },
    speed: id === 1 ? 0.01 : 0.09,
    height: 1.72,
    confidence: 0.95,
    rangeBin: 20 + id,
    breathDeviation: 0.1,
    heartRate,
    breathRate,
    heartWaveform: [waveform, waveform + 0.1],
    breathWaveform: [-waveform, -waveform - 0.1],
    trajectory: [{ x: id, y: 3, atMs: 1_000 }],
    state: 'normal',
    lastSeenAtMs: 1_000,
  }
}

function twoPersonSnapshot(): LifeSensingSnapshot {
  return {
    frameNumber: 10,
    receivedAtMs: Date.UTC(2026, 7, 14, 10, 0, 0),
    points: [{ x: 0.5, y: 2, z: 0.4, doppler: 0.1, snr: 18 }],
    people: [person(1, 72, 16, 0.2), person(2, 82, 18, 0.7)],
  }
}

test('maps only the selected person into metrics and raw waveform trends', async () => {
  const base = await mockDashboardDataProvider.getDashboard('lifeSensing')

  const view = mapLifeSensingSnapshot(base, twoPersonSnapshot(), [], 2)

  assert.equal(view.lifeSensing?.selectedPersonId, 2)
  assert.equal(view.lifeSensing?.people.length, 2)
  assert.equal(view.metrics.find((item) => item.labelKey === 'metrics.heartRate')?.value, '82')
  assert.equal(view.metrics.find((item) => item.labelKey === 'metrics.breathing')?.value, '18')
  assert.equal(view.trend.unit, '')
  assert.deepEqual(view.trend.series[0].values, [-0.7, -0.8])
  assert.deepEqual(view.trend.series[1].values, [0.7, 0.8])
})

test('falls back to the first detected person and preserves real radar geometry', async () => {
  const base = await mockDashboardDataProvider.getDashboard('lifeSensing')

  const view = mapLifeSensingSnapshot(base, twoPersonSnapshot(), [], 99, 'stale', 3)

  assert.equal(view.lifeSensing?.selectedPersonId, 1)
  assert.equal(view.lifeSensing?.status, 'stale')
  assert.equal(view.lifeSensing?.parseErrorCount, 3)
  assert.deepEqual(view.lifeSensing?.points, twoPersonSnapshot().points)
  assert.equal(view.cases.length, 0)
  assert.equal(view.defaultCaseId, '')
})
