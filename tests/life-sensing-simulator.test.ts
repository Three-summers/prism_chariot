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
  assert.ok(fallPhase.heights[0].maxZ < first.heights[0].maxZ * 0.6)
  assert.equal(fallPhase.vitalSigns[0].heartRate, 44)
  assert.equal(fallPhase.vitalSigns[1].heartRate, 78)
  assert.ok(first.points.length >= 30)
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
