export interface LineProtrusionImageData {
  data: ArrayLike<number>
  width: number
  height: number
}

export interface ProtrusionPoint {
  x: number
  y: number
}

export type WireIndex = 0 | 1
export type WireState = 'ok' | 'warning' | 'alarm'
export type LineProtrusionState = WireState | 'failed'

export interface WireCalibration {
  wire: WireIndex
  /** Normalized source coordinates in the range 0..1. */
  spots: [ProtrusionPoint, ProtrusionPoint, ProtrusionPoint]
}

export interface LineProtrusionConfig {
  warningDeg: number
  alarmDeg: number
  sensitivity: number
}

export interface WireDetection {
  wire: WireIndex
  /** Normalized source coordinates in the range 0..1. */
  spots: [ProtrusionPoint, ProtrusionPoint, ProtrusionPoint]
  deviationDeg: number
  state: WireState
}

export interface LineProtrusionDetectionResult {
  width: number
  height: number
  wires: WireDetection[]
  state: LineProtrusionState
  error?: string
}
