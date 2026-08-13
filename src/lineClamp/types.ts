export type LineClampStatus = 'ok' | 'no-screw' | 'tilted' | 'tilted-no-screw' | 'failed'

export interface LineClampBox {
  x: number
  y: number
  width: number
  height: number
}

export interface LineClampCalibration {
  filename: string
  box: LineClampBox
  screw: {
    x: number
    y: number
    expected: boolean
  }
}

export interface LineClampDetectionResult {
  filename: string
  width: number
  height: number
  center: { x: number; y: number }
  angleDeg: number
  area: number
  success: boolean
  hasScrew: boolean
  screwContrast: number
  isTilted: boolean
  status: LineClampStatus
  box: LineClampBox | null
  error?: string
}

/** Minimal shape accepted by the detector, including browser ImageData. */
export interface LineClampImageData {
  data: ArrayLike<number>
  width: number
  height: number
}

export interface LineClampDetectionInput {
  image: LineClampImageData
  filename?: string
  calibration?: LineClampCalibration
}

export interface BinaryComponent {
  x: number
  y: number
  width: number
  height: number
  area: number
}
