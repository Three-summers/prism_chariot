import assert from 'node:assert/strict'
import test from 'node:test'
import { LifeSensingAnalyzer } from '../src/lifeSensing/analyzer.ts'
import type { MmWaveFrame, TrackedTarget, VitalSignsReading } from '../src/lifeSensing/types.ts'

interface PersonInput {
  id: number
  speed?: number
  height?: number
  heartRate?: number
  breathRate?: number
  breathDeviation?: number
  waveformValue?: number
}

function person(id: number, options: Omit<PersonInput, 'id'> = {}): PersonInput {
  return { id, ...options }
}

function frameAt(frameNumber: number, ...people: PersonInput[]): MmWaveFrame {
  const tracks: TrackedTarget[] = people.map((item) => ({
    id: item.id,
    x: item.id,
    y: 2 + item.id,
    z: 0.8,
    velocityX: item.speed ?? 0.2,
    velocityY: 0,
    velocityZ: 0,
    accelerationX: 0,
    accelerationY: 0,
    accelerationZ: 0,
    confidence: 0.95,
  }))
  const vitalSigns: VitalSignsReading[] = people.map((item) => ({
    id: item.id,
    rangeBin: 10 + item.id,
    breathDeviation: item.breathDeviation ?? 0.1,
    heartRate: item.heartRate ?? 72,
    breathRate: item.breathRate ?? 16,
    heartWaveform: Array(15).fill(item.waveformValue ?? item.id),
    breathWaveform: Array(15).fill(-(item.waveformValue ?? item.id)),
  }))
  return {
    frameNumber,
    timestampCycles: frameNumber * 100,
    points: [],
    tracks,
    heights: people.map((item) => ({ id: item.id, maxZ: item.height ?? 1.7, minZ: 0.08 })),
    vitalSigns,
  }
}

test('keeps median and waveform histories isolated per person', () => {
  const analyzer = new LifeSensingAnalyzer()
  for (let index = 0; index < 10; index += 1) {
    analyzer.update(frameAt(index, person(1, { heartRate: index === 9 ? 180 : 70 }), person(2, { heartRate: 82 })), index * 100)
  }

  const snapshot = analyzer.snapshot()
  const first = snapshot.people.find((item) => item.id === 1)
  const second = snapshot.people.find((item) => item.id === 2)

  assert.equal(first?.heartRate, 70)
  assert.equal(second?.heartRate, 82)
  assert.equal(first?.heartWaveform.length, 150)
  assert.equal(first?.heartWaveform[149], 1)
  assert.equal(second?.heartWaveform[149], 2)
  assert.equal(first?.breathWaveform[149], -1)
})

test('applies duration thresholds and fixed abnormal-state priority', () => {
  const analyzer = new LifeSensingAnalyzer()
  for (let time = 0; time <= 5_000; time += 100) analyzer.update(frameAt(time / 100, person(1, { speed: 0.01 })), time)
  assert.equal(analyzer.snapshot().people[0].state, 'motionless')

  for (let time = 5_100; time <= 7_100; time += 100) analyzer.update(frameAt(time / 100, person(1, { speed: 0.01, breathDeviation: 0.01 })), time)
  assert.equal(analyzer.snapshot().people[0].state, 'breathHold')

  for (let time = 7_200; time <= 10_200; time += 100) analyzer.update(frameAt(time / 100, person(1, { speed: 0.01, breathDeviation: 0.01, heartRate: 45, breathRate: 8 })), time)
  assert.equal(analyzer.snapshot().people[0].state, 'vitalsAbnormal')
})

test('detects a fall against valid height from 2.5 seconds earlier and recovers', () => {
  const analyzer = new LifeSensingAnalyzer()
  for (let time = 0; time < 2_500; time += 100) analyzer.update(frameAt(time / 100, person(1, { height: 1.7 })), time)

  analyzer.update(frameAt(25, person(1, { height: 0.8 })), 2_500)
  assert.equal(analyzer.snapshot().people[0].state, 'fallen')

  analyzer.update(frameAt(26, person(1, { height: 1.7 })), 2_600)
  assert.equal(analyzer.snapshot().people[0].state, 'normal')
})

test('marks missing people not detected and restarts continuous timers', () => {
  const analyzer = new LifeSensingAnalyzer()
  analyzer.update(frameAt(0, person(1, { speed: 0.01 })), 0)
  analyzer.update(frameAt(1), 100)
  assert.equal(analyzer.snapshot().people[0].state, 'notDetected')

  for (let time = 200; time <= 5_100; time += 100) analyzer.update(frameAt(time / 100, person(1, { speed: 0.01 })), time)
  assert.equal(analyzer.snapshot().people[0].state, 'normal')

  analyzer.update(frameAt(52, person(1, { speed: 0.01 })), 5_200)
  assert.equal(analyzer.snapshot().people[0].state, 'motionless')
})
