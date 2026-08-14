import { mockDashboardDataProvider } from '../data/DashboardDataProvider.ts'
import type { DashboardViewModel } from '../modules/types.ts'
import { LifeSensingAnalyzer } from './analyzer.ts'
import { LifeSensingCaseTracker } from './caseTracker.ts'
import { mapLifeSensingSnapshot } from './lifeSensingViewModel.ts'
import { MmWaveStreamDecoder } from './protocol.ts'
import { SimulatedSerialSource } from './simulator.ts'
import type { LifeSensingByteSource, LifeSensingSnapshot, LifeSensingStreamStatus } from './types.ts'

const STALE_AFTER_MS = 1_000

export interface LifeSensingProviderClock {
  now(): number
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

interface LifeSensingDataProviderOptions {
  source?: LifeSensingByteSource
  clock?: LifeSensingProviderClock
}

const browserClock: LifeSensingProviderClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as number),
}

export class LifeSensingDataProvider {
  readonly sourceKind: 'simulated' | 'serial'
  private readonly source: LifeSensingByteSource
  private readonly clock: LifeSensingProviderClock
  private decoder = new MmWaveStreamDecoder()
  private analyzer = new LifeSensingAnalyzer()
  private tracker = new LifeSensingCaseTracker()
  private listeners = new Set<(viewModel: DashboardViewModel) => void>()
  private streamStatus: LifeSensingStreamStatus = 'stopped'
  private base: DashboardViewModel | null = null
  private currentView: DashboardViewModel | null = null
  private snapshot: LifeSensingSnapshot = emptySnapshot(0)
  private selectedPersonId: number | null = null
  private staleTimer: unknown = null
  private generation = 0
  private running = false

  constructor(options: LifeSensingDataProviderOptions = {}) {
    this.source = options.source ?? new SimulatedSerialSource()
    this.sourceKind = this.source.kind
    this.clock = options.clock ?? browserClock
  }

  get status(): LifeSensingStreamStatus {
    return this.streamStatus
  }

  async start(): Promise<DashboardViewModel> {
    if (this.running) this.stop()
    const generation = ++this.generation
    this.running = true
    this.streamStatus = 'connecting'
    this.decoder = new MmWaveStreamDecoder()
    this.analyzer = new LifeSensingAnalyzer()
    this.tracker = new LifeSensingCaseTracker()
    this.selectedPersonId = null
    this.snapshot = emptySnapshot(this.clock.now())
    this.base = await mockDashboardDataProvider.getDashboard('lifeSensing')

    if (!this.running || generation !== this.generation) return this.base
    this.publish()
    try {
      await this.source.start({
        onBytes: (chunk) => {
          if (this.accepts(generation)) this.receiveBytes(chunk, generation)
        },
        onStatus: (status) => {
          if (this.accepts(generation)) this.setStatus(status)
        },
        onError: () => {
          if (this.accepts(generation)) this.setStatus('error')
        },
      })
    } catch {
      if (this.accepts(generation)) this.setStatus('error')
    }
    return this.currentView ?? this.base
  }

  stop(): void {
    this.generation += 1
    const wasRunning = this.running
    this.running = false
    this.clearStaleTimer()
    if (wasRunning) void this.source.stop()
    this.streamStatus = 'stopped'
    this.publish()
  }

  subscribe(listener: (viewModel: DashboardViewModel) => void): () => void {
    this.listeners.add(listener)
    if (this.currentView) listener(structuredClone(this.currentView))
    return () => this.listeners.delete(listener)
  }

  selectPerson(personId: number): void {
    if (!this.running) return
    this.selectedPersonId = personId
    this.publish()
    this.selectedPersonId = this.currentView?.lifeSensing?.selectedPersonId ?? null
  }

  private accepts(generation: number): boolean {
    return this.running && generation === this.generation
  }

  private receiveBytes(chunk: Uint8Array, generation: number): void {
    const previousErrorCount = this.decoder.parseErrorCount
    const frames = this.decoder.push(chunk)
    for (const frame of frames) {
      const receivedAtMs = this.clock.now()
      this.snapshot = this.analyzer.update(frame, receivedAtMs)
      if (!this.snapshot.people.some((person) => person.id === this.selectedPersonId)) {
        this.selectedPersonId = this.snapshot.people[0]?.id ?? null
      }
      this.tracker.update(this.snapshot.people, localTimestamp(receivedAtMs))
      this.streamStatus = 'streaming'
      this.scheduleStale(generation)
      this.publish()
    }
    if (frames.length === 0 && this.decoder.parseErrorCount !== previousErrorCount) this.publish()
  }

  private setStatus(status: LifeSensingStreamStatus): void {
    this.streamStatus = status
    if (status === 'stopped' || status === 'error') this.clearStaleTimer()
    this.publish()
  }

  private scheduleStale(generation: number): void {
    this.clearStaleTimer()
    this.staleTimer = this.clock.setTimeout(() => {
      this.staleTimer = null
      if (!this.accepts(generation)) return
      this.streamStatus = 'stale'
      this.publish()
    }, STALE_AFTER_MS)
  }

  private clearStaleTimer(): void {
    if (this.staleTimer !== null) this.clock.clearTimeout(this.staleTimer)
    this.staleTimer = null
  }

  private publish(): void {
    if (!this.base) return
    this.currentView = mapLifeSensingSnapshot(
      this.base,
      this.snapshot,
      this.tracker.cases(),
      this.selectedPersonId,
      this.streamStatus,
      this.decoder.parseErrorCount,
      this.sourceKind,
    )
    for (const listener of this.listeners) listener(structuredClone(this.currentView))
  }
}

export const lifeSensingDataProvider = new LifeSensingDataProvider()

function emptySnapshot(receivedAtMs: number): LifeSensingSnapshot {
  return { frameNumber: 0, receivedAtMs, points: [], people: [] }
}

function localTimestamp(value: number): string {
  const date = new Date(value)
  const parts = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()]
  return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')} ${String(parts[3]).padStart(2, '0')}:${String(parts[4]).padStart(2, '0')}:${String(parts[5]).padStart(2, '0')}`
}
