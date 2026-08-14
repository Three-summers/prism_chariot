import { encodeMmWaveFrame } from './protocol.ts'
import type { LifeSensingByteSink, LifeSensingByteSource, MmWaveFrame, RadarPoint, TrackedTarget, VitalSignsReading } from './types.ts'

const SCENARIO_DURATION_MS = 36_000
const FRAME_INTERVAL_MS = 100
const CHUNK_PATTERN = [31, 73, 19, 127, 47, 211]

export interface SimulatorClock {
  now(): number
  setInterval(callback: () => void, intervalMs: number): unknown
  clearInterval(handle: unknown): void
}

interface SimulatedSourceOptions {
  clock?: SimulatorClock
}

const browserClock: SimulatorClock = {
  now: () => performance.now(),
  setInterval: (callback, intervalMs) => globalThis.setInterval(callback, intervalMs),
  clearInterval: (handle) => globalThis.clearInterval(handle as number),
}

export function createSimulatedFrame(elapsedMs: number, frameNumber: number): MmWaveFrame {
  const elapsedSeconds = positiveModulo(elapsedMs, SCENARIO_DURATION_MS) / 1_000
  const first = firstPerson(elapsedSeconds)
  const second = secondPerson(elapsedSeconds)
  return {
    frameNumber,
    timestampCycles: Math.round(elapsedMs * 200),
    points: createPointCloud(first.track, second.track, elapsedSeconds),
    tracks: [first.track, second.track],
    heights: [
      { id: first.track.id, maxZ: first.height, minZ: 0.06 },
      { id: second.track.id, maxZ: second.height, minZ: 0.08 },
    ],
    vitalSigns: [first.vitalSigns, second.vitalSigns],
  }
}

export class SimulatedSerialSource implements LifeSensingByteSource {
  readonly kind = 'simulated' as const
  private readonly clock: SimulatorClock
  private intervalHandle: unknown = null
  private sink: LifeSensingByteSink | null = null
  private startedAt = 0
  private frameNumber = 0
  private chunkCursor = 0

  constructor(options: SimulatedSourceOptions = {}) {
    this.clock = options.clock ?? browserClock
  }

  start(sink: LifeSensingByteSink): void {
    this.stop()
    this.sink = sink
    this.startedAt = this.clock.now()
    this.frameNumber = 0
    this.chunkCursor = 0
    sink.onStatus('connecting')
    this.intervalHandle = this.clock.setInterval(() => this.emitFrame(), FRAME_INTERVAL_MS)
    sink.onStatus('streaming')
  }

  stop(): void {
    const activeSink = this.sink
    if (this.intervalHandle !== null) this.clock.clearInterval(this.intervalHandle)
    this.intervalHandle = null
    this.sink = null
    if (activeSink) activeSink.onStatus('stopped')
  }

  private emitFrame(): void {
    const sink = this.sink
    if (!sink) return
    try {
      this.frameNumber += 1
      const frame = createSimulatedFrame(this.clock.now() - this.startedAt, this.frameNumber)
      const bytes = encodeMmWaveFrame(frame)
      let offset = 0
      while (offset < bytes.length && this.sink === sink) {
        const chunkLength = CHUNK_PATTERN[this.chunkCursor % CHUNK_PATTERN.length]
        this.chunkCursor += 1
        const end = Math.min(bytes.length, offset + chunkLength)
        sink.onBytes(bytes.slice(offset, end))
        offset = end
      }
    } catch (error) {
      sink.onError(error instanceof Error ? error : new Error(String(error)))
    }
  }
}

function firstPerson(time: number): { track: TrackedTarget; height: number; vitalSigns: VitalSignsReading } {
  const moving = time < 6 || time >= 27
  const speed = moving ? 0.16 : time < 7 ? Math.max(0.01, 0.16 * (7 - time)) : 0.01
  const x = time < 6 ? -1 + time * 0.08 : time < 27 ? -0.52 : -0.52 + (time - 27) * 0.05
  const y = 2.55 + (moving ? Math.sin(time * 0.45) * 0.08 : 0)
  const fallingProgress = time >= 19 && time < 27 ? Math.min(1, (time - 19) / 0.5) : 0
  const height = time >= 19 && time < 27 ? 1.72 - 1.07 * fallingProgress : 1.72
  const breathHold = time >= 13 && time < 19
  const lowVitals = time >= 19 && time < 27
  const heartRate = lowVitals ? 44 : 72
  const breathRate = breathHold ? 0 : lowVitals ? 9 : 16
  return {
    track: target(1, x, y, height * 0.48, speed, 0, 0.97),
    height,
    vitalSigns: vitalSigns(1, Math.hypot(x, y), time, heartRate, breathRate, breathHold ? 0.008 : 0.11, 0),
  }
}

function secondPerson(time: number): { track: TrackedTarget; height: number; vitalSigns: VitalSignsReading } {
  const x = 1.18 + Math.sin(time * 0.34) * 0.2
  const y = 3.65 + Math.cos(time * 0.31) * 0.18
  const velocityX = Math.cos(time * 0.34) * 0.068
  const velocityY = -Math.sin(time * 0.31) * 0.056
  return {
    track: target(2, x, y, 0.84, velocityX, velocityY, 0.95),
    height: 1.76,
    vitalSigns: vitalSigns(2, Math.hypot(x, y), time, 78, 17, 0.13, Math.PI / 3),
  }
}

function target(id: number, x: number, y: number, z: number, velocityX: number, velocityY: number, confidence: number): TrackedTarget {
  return {
    id, x, y, z, velocityX, velocityY, velocityZ: 0,
    accelerationX: 0, accelerationY: 0, accelerationZ: 0, confidence,
  }
}

function vitalSigns(id: number, range: number, time: number, heartRate: number, breathRate: number, breathDeviation: number, phase: number): VitalSignsReading {
  const heartWaveform = Array.from({ length: 15 }, (_, index) => {
    const sampleTime = time + index / 150
    return Math.sin(sampleTime * Math.PI * 2 * heartRate / 60 + phase) * 0.28
  })
  const effectiveBreathRate = Math.max(1, breathRate)
  const breathWaveform = Array.from({ length: 15 }, (_, index) => {
    const sampleTime = time + index / 150
    return breathDeviation < 0.02 ? 0.005 * Math.sin(sampleTime * 3) : Math.sin(sampleTime * Math.PI * 2 * effectiveBreathRate / 60 + phase) * 0.68
  })
  return {
    id,
    rangeBin: Math.round(range / 0.05),
    breathDeviation,
    heartRate,
    breathRate,
    heartWaveform,
    breathWaveform,
  }
}

function createPointCloud(first: TrackedTarget, second: TrackedTarget, time: number): RadarPoint[] {
  const points: RadarPoint[] = []
  for (const [personIndex, track] of [first, second].entries()) {
    for (let index = 0; index < 24; index += 1) {
      const angle = index * Math.PI * 2 / 24 + time * 0.08 + personIndex
      const radius = 0.08 + (index % 5) * 0.018
      points.push({
        x: track.x + Math.cos(angle) * radius,
        y: track.y + Math.sin(angle) * radius,
        z: Math.max(0.08, track.z + ((index % 7) - 3) * 0.06),
        doppler: Math.hypot(track.velocityX, track.velocityY) * Math.cos(angle),
        snr: 16 + index % 8,
      })
    }
  }
  for (let index = 0; index < 12; index += 1) {
    points.push({
      x: -2.2 + index * 0.4,
      y: 1.2 + (index % 4) * 1.05,
      z: 0.06,
      doppler: 0,
      snr: 6 + index % 3,
    })
  }
  return points
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus
}
