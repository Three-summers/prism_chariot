import assert from 'node:assert/strict'
import test from 'node:test'
import { MmWaveStreamDecoder } from '../src/lifeSensing/protocol.ts'
import { createSimulatedFrame, SimulatedSerialSource, type SimulatorClock } from '../src/lifeSensing/simulator.ts'
import type { LifeSensingByteSink, LifeSensingStreamStatus } from '../src/lifeSensing/types.ts'

class ManualClock implements SimulatorClock {
  private current = 0
  private nextHandle = 1
  private callbacks = new Map<number, () => void>()

  now(): number { return this.current }

  setInterval(callback: () => void): number {
    const handle = this.nextHandle
    this.nextHandle += 1
    this.callbacks.set(handle, callback)
    return handle
  }

  clearInterval(handle: unknown): void {
    this.callbacks.delete(handle as number)
  }

  advance(milliseconds: number): void {
    this.current += milliseconds
    for (const callback of [...this.callbacks.values()]) callback()
  }
}

test('cycles a deterministic two-person scenario every 36 seconds', () => {
  const first = createSimulatedFrame(0, 1)
  const repeated = createSimulatedFrame(36_000, 361)
  const fallPhase = createSimulatedFrame(20_000, 201)

  assert.equal(first.tracks.length, 2)
  assert.deepEqual(
    repeated.tracks.map(({ x, y, z }) => ({ x, y, z })),
    first.tracks.map(({ x, y, z }) => ({ x, y, z })),
  )
  assert.deepEqual(
    repeated.vitalSigns.map(({ heartRate, breathRate }) => ({ heartRate, breathRate })),
    first.vitalSigns.map(({ heartRate, breathRate }) => ({ heartRate, breathRate })),
  )
  assert.ok(fallPhase.heights[0].maxZ < first.heights[0].maxZ * 0.6)
  assert.equal(fallPhase.vitalSigns[0].heartRate, 44)
  assert.ok(fallPhase.vitalSigns[1].heartRate >= 78 && fallPhase.vitalSigns[1].heartRate <= 84)
  assert.ok(first.points.length >= 30)
})

test('keeps normal vital rates centered on 81 bpm with visible smooth variation', () => {
  const sampleTimes = [0, 1_500, 3_000, 4_500]
  const frames = sampleTimes.map((elapsedMs, index) => createSimulatedFrame(elapsedMs, index + 1))

  for (const personIndex of [0, 1]) {
    const samples = frames.map(({ vitalSigns }) => vitalSigns[personIndex])
    const heartRates = samples.map(({ heartRate }) => heartRate)
    const breathRates = samples.map(({ breathRate }) => breathRate)

    assert.equal(heartRates[0], 81)
    assert.ok(new Set(heartRates).size > 1)
    assert.ok(heartRates.every((value) => value >= 78 && value <= 84))
    assert.ok(new Set(breathRates).size > 1)
    assert.ok(breathRates.every((value) => value >= 15 && value <= 19))
  }
})

test('emits variable binary chunks that decode through the real stream decoder', () => {
  const clock = new ManualClock()
  const source = new SimulatedSerialSource({ clock })
  const decoder = new MmWaveStreamDecoder()
  const chunkSizes: number[] = []
  const frames: number[] = []
  const statuses: LifeSensingStreamStatus[] = []
  const sink: LifeSensingByteSink = {
    onBytes(chunk) {
      chunkSizes.push(chunk.length)
      frames.push(...decoder.push(chunk).map((frame) => frame.frameNumber))
    },
    onStatus(status) { statuses.push(status) },
    onError(error) { throw error },
  }

  source.start(sink)
  clock.advance(100)
  clock.advance(100)

  assert.deepEqual(frames, [1, 2])
  assert.ok(new Set(chunkSizes).size > 1)
  assert.deepEqual(statuses, ['connecting', 'streaming'])
})

test('stops emitting and reports stopped after source stop', () => {
  const clock = new ManualClock()
  const source = new SimulatedSerialSource({ clock })
  const chunks: Uint8Array[] = []
  const statuses: LifeSensingStreamStatus[] = []
  source.start({ onBytes: (chunk) => chunks.push(chunk), onStatus: (status) => statuses.push(status), onError(error) { throw error } })
  clock.advance(100)

  source.stop()
  const countAfterStop = chunks.length
  clock.advance(100)

  assert.ok(countAfterStop > 0)
  assert.equal(chunks.length, countAfterStop)
  assert.equal(statuses.at(-1), 'stopped')
})
