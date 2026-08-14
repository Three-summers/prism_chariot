import assert from 'node:assert/strict'
import test from 'node:test'
import { LifeSensingDataProvider } from '../src/lifeSensing/lifeSensingDataProvider.ts'
import { encodeMmWaveFrame } from '../src/lifeSensing/protocol.ts'
import { createSimulatedFrame } from '../src/lifeSensing/simulator.ts'
import type { LifeSensingByteSink, LifeSensingByteSource } from '../src/lifeSensing/types.ts'
import type { DashboardViewModel } from '../src/modules/types.ts'

class ManualClock {
  current = 1_000
  private nextId = 1
  private timers = new Map<number, { at: number; callback: () => void }>()

  now = (): number => this.current

  setTimeout = (callback: () => void, delayMs: number): number => {
    const id = this.nextId++
    this.timers.set(id, { at: this.current + delayMs, callback })
    return id
  }

  clearTimeout = (handle: unknown): void => {
    this.timers.delete(handle as number)
  }

  tick(milliseconds: number): void {
    this.current += milliseconds
    const due = [...this.timers.entries()].filter(([, timer]) => timer.at <= this.current)
    for (const [id, timer] of due) {
      this.timers.delete(id)
      timer.callback()
    }
  }
}

class TestByteSource implements LifeSensingByteSource {
  readonly kind = 'simulated' as const
  startCount = 0
  stopCount = 0
  private activeSink: LifeSensingByteSink | null = null
  private sinks: LifeSensingByteSink[] = []

  start(sink: LifeSensingByteSink): void {
    this.startCount += 1
    this.activeSink = sink
    this.sinks.push(sink)
    sink.onStatus('streaming')
  }

  stop(): void {
    this.stopCount += 1
    this.activeSink = null
  }

  emit(bytes: Uint8Array): void {
    this.activeSink?.onBytes(bytes)
  }

  emitLate(bytes: Uint8Array, startIndex = 0): void {
    this.sinks[startIndex]?.onBytes(bytes)
  }
}

function latest(updates: DashboardViewModel[]): DashboardViewModel {
  const view = updates[updates.length - 1]
  assert.ok(view)
  return view
}

test('streams decoded frames through analysis and switches selected person', async () => {
  const source = new TestByteSource()
  const clock = new ManualClock()
  const provider = new LifeSensingDataProvider({ source, clock })
  const updates: DashboardViewModel[] = []
  provider.subscribe((view) => updates.push(view))

  await provider.start()
  source.emit(encodeMmWaveFrame(createSimulatedFrame(0, 1)))

  assert.equal(latest(updates).lifeSensing?.people.length, 2)
  assert.equal(latest(updates).lifeSensing?.selectedPersonId, 1)
  provider.selectPerson(2)
  assert.equal(latest(updates).lifeSensing?.selectedPersonId, 2)
  assert.equal(latest(updates).metrics.find((metric) => metric.labelKey === 'metrics.heartRate')?.value, '78')
})

test('marks a silent stream stale after one second and recovers on a valid frame', async () => {
  const source = new TestByteSource()
  const clock = new ManualClock()
  const provider = new LifeSensingDataProvider({ source, clock })
  const updates: DashboardViewModel[] = []
  provider.subscribe((view) => updates.push(view))
  await provider.start()

  source.emit(encodeMmWaveFrame(createSimulatedFrame(0, 1)))
  clock.tick(999)
  assert.equal(provider.status, 'streaming')
  clock.tick(1)
  assert.equal(provider.status, 'stale')
  assert.equal(latest(updates).lifeSensing?.status, 'stale')

  source.emit(encodeMmWaveFrame(createSimulatedFrame(1_000, 2)))
  assert.equal(provider.status, 'streaming')
  assert.equal(latest(updates).lifeSensing?.status, 'streaming')
})

test('reports parse errors without analyzing the invalid frame', async () => {
  const source = new TestByteSource()
  const provider = new LifeSensingDataProvider({ source, clock: new ManualClock() })
  const updates: DashboardViewModel[] = []
  provider.subscribe((view) => updates.push(view))
  await provider.start()

  const invalid = encodeMmWaveFrame(createSimulatedFrame(0, 1))
  new DataView(invalid.buffer, invalid.byteOffset, invalid.byteLength).setUint32(12, 1, true)
  source.emit(invalid)

  assert.equal(latest(updates).lifeSensing?.parseErrorCount, 1)
  assert.equal(latest(updates).lifeSensing?.people.length, 0)
})

test('stops its source and ignores late bytes from an obsolete start', async () => {
  const source = new TestByteSource()
  const provider = new LifeSensingDataProvider({ source, clock: new ManualClock() })
  const updates: DashboardViewModel[] = []
  provider.subscribe((view) => updates.push(view))
  await provider.start()
  provider.stop()
  const countAfterStop = updates.length

  source.emitLate(encodeMmWaveFrame(createSimulatedFrame(0, 1)))

  assert.equal(source.stopCount, 1)
  assert.equal(provider.status, 'stopped')
  assert.equal(updates.length, countAfterStop)

  await provider.start()
  source.emitLate(encodeMmWaveFrame(createSimulatedFrame(100, 2)))
  assert.equal(latest(updates).lifeSensing?.people.length, 0)
  source.emit(encodeMmWaveFrame(createSimulatedFrame(100, 2)))
  assert.equal(latest(updates).lifeSensing?.people.length, 2)
})
