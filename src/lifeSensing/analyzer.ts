import type { LifeSensingSnapshot, LifeState, MmWaveFrame, PersonSnapshot, TrackedTarget, VitalSignsReading } from './types.ts'

const HEART_RATE_WINDOW = 10
const WAVEFORM_WINDOW = 150
const TRAJECTORY_WINDOW = 40
const HEIGHT_LOOKBACK_MS = 2_500
const MOTIONLESS_DURATION_MS = 5_000
const BREATH_HOLD_DURATION_MS = 2_000
const VITALS_ABNORMAL_DURATION_MS = 3_000

interface TimedHeight {
  atMs: number
  value: number
}

interface PersonHistory {
  heartRates: number[]
  heartWaveform: number[]
  breathWaveform: number[]
  heightHistory: TimedHeight[]
  trajectory: Array<{ x: number; y: number; atMs: number }>
  motionlessSince: number | null
  breathHoldSince: number | null
  vitalsAbnormalSince: number | null
  snapshot: PersonSnapshot
}

export class LifeSensingAnalyzer {
  private histories = new Map<number, PersonHistory>()
  private current: LifeSensingSnapshot = { frameNumber: 0, receivedAtMs: 0, points: [], people: [] }

  update(frame: MmWaveFrame, receivedAtMs: number): LifeSensingSnapshot {
    const tracks = new Map(frame.tracks.map((track) => [track.id, track]))
    const heights = new Map(frame.heights.map((height) => [height.id, height]))
    const vitalSigns = new Map(frame.vitalSigns.map((reading) => [reading.id, reading]))

    for (const [id, history] of this.histories) {
      if (tracks.has(id)) continue
      resetTimers(history)
      history.heightHistory = []
      history.snapshot = { ...history.snapshot, state: 'notDetected' }
    }

    for (const track of frame.tracks) {
      const history = this.histories.get(track.id) ?? createHistory(track, receivedAtMs)
      this.histories.set(track.id, history)
      updatePerson(history, track, heights.get(track.id)?.maxZ, vitalSigns.get(track.id), receivedAtMs)
    }

    this.current = {
      frameNumber: frame.frameNumber,
      receivedAtMs,
      points: frame.points.map((point) => ({ ...point })),
      people: [...this.histories.values()].map((history) => clonePerson(history.snapshot)).sort((first, second) => first.id - second.id),
    }
    return this.snapshot()
  }

  snapshot(): LifeSensingSnapshot {
    return {
      ...this.current,
      points: this.current.points.map((point) => ({ ...point })),
      people: this.current.people.map(clonePerson),
    }
  }

  reset(): void {
    this.histories.clear()
    this.current = { frameNumber: 0, receivedAtMs: 0, points: [], people: [] }
  }
}

function updatePerson(history: PersonHistory, track: TrackedTarget, height: number | undefined, vitalSigns: VitalSignsReading | undefined, receivedAtMs: number): void {
  const speed = Math.hypot(track.velocityX, track.velocityY, track.velocityZ)
  history.trajectory = appendLimited(history.trajectory, { x: track.x, y: track.y, atMs: receivedAtMs }, TRAJECTORY_WINDOW)
  if (height !== undefined && Number.isFinite(height)) {
    history.heightHistory.push({ atMs: receivedAtMs, value: height })
    history.heightHistory = history.heightHistory.filter((sample) => sample.atMs >= receivedAtMs - HEIGHT_LOOKBACK_MS - 500)
  }

  const detected = vitalSigns !== undefined && vitalSigns.breathDeviation > 0
  if (!detected) {
    resetTimers(history)
    history.snapshot = makeSnapshot(history, track, height, vitalSigns, speed, 'notDetected', receivedAtMs)
    return
  }

  if (Number.isFinite(vitalSigns.heartRate) && vitalSigns.heartRate > 0) {
    history.heartRates = appendLimited(history.heartRates, vitalSigns.heartRate, HEART_RATE_WINDOW)
  }
  history.heartWaveform = appendManyLimited(history.heartWaveform, vitalSigns.heartWaveform, WAVEFORM_WINDOW)
  history.breathWaveform = appendManyLimited(history.breathWaveform, vitalSigns.breathWaveform, WAVEFORM_WINDOW)
  history.motionlessSince = updateStart(speed < 0.03, history.motionlessSince, receivedAtMs)
  history.breathHoldSince = updateStart(vitalSigns.breathDeviation < 0.02, history.breathHoldSince, receivedAtMs)

  const heartRate = median(history.heartRates)
  const vitalsOutsideRange = heartRate < 50 || heartRate > 110 || vitalSigns.breathRate < 10 || vitalSigns.breathRate > 24
  history.vitalsAbnormalSince = updateStart(vitalsOutsideRange, history.vitalsAbnormalSince, receivedAtMs)

  const state = determineState(history, height, receivedAtMs)
  history.snapshot = makeSnapshot(history, track, height, vitalSigns, speed, state, receivedAtMs)
}

function determineState(history: PersonHistory, currentHeight: number | undefined, receivedAtMs: number): LifeState {
  const comparisonTime = receivedAtMs - HEIGHT_LOOKBACK_MS
  const previousHeight = [...history.heightHistory].reverse().find((sample) => sample.atMs <= comparisonTime)?.value
  if (currentHeight !== undefined && previousHeight !== undefined && previousHeight > 0 && currentHeight < previousHeight * 0.6) return 'fallen'
  if (hasElapsed(history.vitalsAbnormalSince, receivedAtMs, VITALS_ABNORMAL_DURATION_MS)) return 'vitalsAbnormal'
  if (hasElapsed(history.breathHoldSince, receivedAtMs, BREATH_HOLD_DURATION_MS)) return 'breathHold'
  if (hasElapsed(history.motionlessSince, receivedAtMs, MOTIONLESS_DURATION_MS)) return 'motionless'
  return 'normal'
}

function createHistory(track: TrackedTarget, receivedAtMs: number): PersonHistory {
  const snapshot: PersonSnapshot = {
    id: track.id,
    position: { x: track.x, y: track.y, z: track.z },
    speed: Math.hypot(track.velocityX, track.velocityY, track.velocityZ),
    height: 0,
    confidence: track.confidence,
    rangeBin: 0,
    breathDeviation: 0,
    heartRate: 0,
    breathRate: 0,
    heartWaveform: [],
    breathWaveform: [],
    trajectory: [],
    state: 'notDetected',
    lastSeenAtMs: receivedAtMs,
  }
  return {
    heartRates: [], heartWaveform: [], breathWaveform: [], heightHistory: [], trajectory: [],
    motionlessSince: null, breathHoldSince: null, vitalsAbnormalSince: null, snapshot,
  }
}

function makeSnapshot(history: PersonHistory, track: TrackedTarget, height: number | undefined, vitalSigns: VitalSignsReading | undefined, speed: number, state: LifeState, receivedAtMs: number): PersonSnapshot {
  return {
    id: track.id,
    position: { x: track.x, y: track.y, z: track.z },
    speed,
    height: height ?? history.snapshot.height,
    confidence: track.confidence,
    rangeBin: vitalSigns?.rangeBin ?? history.snapshot.rangeBin,
    breathDeviation: vitalSigns?.breathDeviation ?? 0,
    heartRate: median(history.heartRates),
    breathRate: vitalSigns?.breathRate ?? 0,
    heartWaveform: [...history.heartWaveform],
    breathWaveform: [...history.breathWaveform],
    trajectory: history.trajectory.map((point) => ({ ...point })),
    state,
    lastSeenAtMs: receivedAtMs,
  }
}

function resetTimers(history: PersonHistory): void {
  history.motionlessSince = null
  history.breathHoldSince = null
  history.vitalsAbnormalSince = null
}

function updateStart(condition: boolean, current: number | null, now: number): number | null {
  if (!condition) return null
  return current ?? now
}

function hasElapsed(startedAt: number | null, now: number, duration: number): boolean {
  return startedAt !== null && now - startedAt >= duration
}

function appendLimited<T>(values: T[], value: T, limit: number): T[] {
  return [...values, value].slice(-limit)
}

function appendManyLimited<T>(values: T[], additions: readonly T[], limit: number): T[] {
  return [...values, ...additions].slice(-limit)
}

function median(values: readonly number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((first, second) => first - second)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function clonePerson(person: PersonSnapshot): PersonSnapshot {
  return {
    ...person,
    position: { ...person.position },
    heartWaveform: [...person.heartWaveform],
    breathWaveform: [...person.breathWaveform],
    trajectory: person.trajectory.map((point) => ({ ...point })),
  }
}
