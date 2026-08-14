export interface MagneticPlateImageData {
  data: ArrayLike<number>
  width: number
  height: number
}

export interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

export interface MagneticStripeSegment extends NormalizedRect {
  centerY: number
  area: number
}

export type MagneticPlateStatus = 'normal' | 'warped' | 'failed'

export interface MagneticPlateDetectionResult {
  width: number
  height: number
  status: MagneticPlateStatus
  roi: NormalizedRect
  segments: MagneticStripeSegment[]
  gapPx: number
  centerJumpPx: number
  continuity: number
  error?: string
}

export interface MagneticPlateConfig {
  roi: NormalizedRect
  brightnessFloor: number
  thresholdMix: number
  minAreaRatio: number
  minWidthRatio: number
  minAspectRatio: number
  normalWidthRatio: number
  warpedCombinedWidthRatio: number
  minGapRatio: number
  minCenterJumpRatio: number
  centerBreakWindowRatio: number
  centerBreakMinXRatio: number
  centerBreakMaxXRatio: number
}
