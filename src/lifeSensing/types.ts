export interface RadarPoint {
  x: number
  y: number
  z: number
  doppler: number
  snr: number
}

export interface TrackedTarget {
  id: number
  x: number
  y: number
  z: number
  velocityX: number
  velocityY: number
  velocityZ: number
  accelerationX: number
  accelerationY: number
  accelerationZ: number
  confidence: number
}

export interface TargetHeight {
  id: number
  maxZ: number
  minZ: number
}

export interface VitalSignsReading {
  id: number
  rangeBin: number
  breathDeviation: number
  heartRate: number
  breathRate: number
  heartWaveform: number[]
  breathWaveform: number[]
}

export interface MmWaveFrame {
  frameNumber: number
  timestampCycles: number
  points: RadarPoint[]
  tracks: TrackedTarget[]
  heights: TargetHeight[]
  vitalSigns: VitalSignsReading[]
}

export type LifeState = 'notDetected' | 'normal' | 'motionless' | 'breathHold' | 'vitalsAbnormal' | 'fallen'

export interface PersonSnapshot {
  id: number
  position: { x: number; y: number; z: number }
  speed: number
  height: number
  confidence: number
  rangeBin: number
  breathDeviation: number
  heartRate: number
  breathRate: number
  heartWaveform: number[]
  breathWaveform: number[]
  trajectory: Array<{ x: number; y: number; atMs: number }>
  state: LifeState
  lastSeenAtMs: number
}

export interface LifeSensingSnapshot {
  frameNumber: number
  receivedAtMs: number
  points: RadarPoint[]
  people: PersonSnapshot[]
}
