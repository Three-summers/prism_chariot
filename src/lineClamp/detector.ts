import { closeBinaryMask, connectedComponents, grayScale, threshold } from './pixels.ts'
import type {
  BinaryComponent,
  LineClampBox,
  LineClampCalibration,
  LineClampDetectionInput,
  LineClampDetectionResult,
  LineClampImageData,
  LineClampStatus,
} from './types.ts'

export const SCREW_CONTRAST_THRESHOLD = 12
export const TILT_ANGLE_THRESHOLD = 3
export const CLIP_TARGET_AREA = 46_500
export const CLIP_AREA_MIN = 43_000
export const CLIP_AREA_MAX = 50_000
export const CLIP_AR_TARGET = 1.65
export const CLIP_AR_MIN = 0.7
export const CLIP_AR_MAX = 2.5

interface Candidate extends BinaryComponent {
  source: Uint8Array
  sourceWidth: number
  sourceHeight: number
  offsetX: number
  offsetY: number
}

export class LineClampDetector {
  detect(input: LineClampDetectionInput): LineClampDetectionResult {
    const image = input?.image
    const filename = input?.filename ?? ''
    if (!isImageData(image)) return failedResult(filename, 0, 0, 'Invalid image data')

    const width = image.width
    const height = image.height
    const gray = grayScale(image.data, width, height)
    const calibration = input.calibration
    const candidate = calibration ? chooseCalibratedCandidate(gray, width, height, calibration) : chooseUncalibratedCandidate(gray, width, height)
    if (calibration) {
      const center = {
        x: calibration.box.x + calibration.box.width / 2,
        y: calibration.box.y + calibration.box.height / 2,
      }
      const angleDeg = candidate ? estimateAngle(candidate.source, candidate.sourceWidth, candidate.sourceHeight, candidate) : 0
      const contrast = screwContrast(gray, width, height, calibration.screw)
      const hasScrew = calibration.screw.expected
      const isTilted = Math.abs(angleDeg) > TILT_ANGLE_THRESHOLD
      return {
        filename,
        width,
        height,
        center,
        angleDeg,
        area: calibration.box.width * calibration.box.height,
        success: true,
        hasScrew,
        screwContrast: contrast,
        isTilted,
        status: classifyLineClampStatus({ success: true, isTilted, hasScrew }),
        box: { ...calibration.box },
      }
    }
    if (!candidate) return failedResult(filename, width, height, 'No suitable clamp candidate found')

    const box: LineClampBox = {
      x: candidate.x + candidate.offsetX,
      y: candidate.y + candidate.offsetY,
      width: candidate.width,
      height: candidate.height,
    }
    const center = {
      x: candidate.x + candidate.offsetX + (candidate.width - 1) / 2,
      y: candidate.y + candidate.offsetY + (candidate.height - 1) / 2,
    }
    const angleDeg = estimateAngle(candidate.source, candidate.sourceWidth, candidate.sourceHeight, candidate)
    const contrast = screwContrast(gray, width, height, center)
    const measuredScrew = contrast > SCREW_CONTRAST_THRESHOLD
    const hasScrew = measuredScrew
    const isTilted = Math.abs(angleDeg) > TILT_ANGLE_THRESHOLD
    const status = classifyLineClampStatus({ success: true, isTilted, hasScrew })
    return {
      filename,
      width,
      height,
      center,
      angleDeg,
      area: candidate.area,
      success: true,
      hasScrew,
      screwContrast: contrast,
      isTilted,
      status,
      box,
    }
  }
}

function chooseCalibratedCandidate(gray: Uint8Array, width: number, height: number, calibration: LineClampCalibration): Candidate | null {
  const margin = 30
  const crop = cropGray(gray, width, height, {
    x: calibration.box.x - margin,
    y: calibration.box.y - margin,
    width: calibration.box.width + margin * 2,
    height: calibration.box.height + margin * 2,
  })
  return chooseCandidate(crop.gray, crop.width, crop.height, crop.offsetX, crop.offsetY, calibration)
}

function chooseUncalibratedCandidate(gray: Uint8Array, width: number, height: number): Candidate | null {
  const centerX = Math.floor(width / 2)
  const centerY = Math.floor(height / 2)
  const windows = [
    [centerX - 300, centerY - 180, centerX + 300, centerY + 80],
    [centerX - 300, centerY - 220, centerX + 300, centerY + 220],
    [centerX - 300, centerY - 80, centerX + 300, centerY + 180],
  ]
  let best: Candidate | null = null
  let bestAreaDiff = Number.POSITIVE_INFINITY
  for (const [rawX1, rawY1, rawX2, rawY2] of windows) {
    const box: LineClampBox = {
      x: Math.max(0, rawX1),
      y: Math.max(0, rawY1),
      width: Math.min(width, rawX2) - Math.max(0, rawX1),
      height: Math.min(height, rawY2) - Math.max(0, rawY1),
    }
    if (box.width <= 0 || box.height <= 0) continue
    const crop = cropGray(gray, width, height, box)
    const candidate = chooseCandidate(crop.gray, crop.width, crop.height, crop.offsetX, crop.offsetY)
    if (!candidate) continue
    const areaDiff = Math.abs(candidate.area - CLIP_TARGET_AREA)
    if (areaDiff < bestAreaDiff) {
      bestAreaDiff = areaDiff
      best = candidate
    }
  }
  return best
}

export function classifyLineClampStatus(result: Pick<LineClampDetectionResult, 'success' | 'isTilted' | 'hasScrew'>): LineClampStatus {
  if (!result.success) return 'failed'
  if (result.isTilted && !result.hasScrew) return 'tilted-no-screw'
  if (result.isTilted) return 'tilted'
  if (!result.hasScrew) return 'no-screw'
  return 'ok'
}

function chooseCandidate(
  gray: Uint8Array,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  calibration?: LineClampCalibration,
): Candidate | null {
  const candidates: Candidate[] = []
  for (const level of [60, 80, 100, 120, 140]) {
    const mask = closeBinaryMask(threshold(gray, level), width, height, 3)
    for (const component of connectedComponents(mask, width, height)) {
      const targetArea = calibration ? calibration.box.width * calibration.box.height : CLIP_TARGET_AREA
      const minArea = calibration ? targetArea * 0.3 : CLIP_AREA_MIN
      const maxArea = calibration ? targetArea * 1.5 : CLIP_AREA_MAX
      const extent = component.area / (component.width * component.height)
      if (component.area < minArea || component.area > maxArea || extent < 0.35) continue
      const aspect = component.width / component.height
      if (aspect < CLIP_AR_MIN || aspect > CLIP_AR_MAX) continue
      candidates.push({ ...component, source: gray, sourceWidth: width, sourceHeight: height, offsetX, offsetY })
    }
  }
  if (candidates.length === 0) return null

  const unique = new Map<string, Candidate>()
  for (const candidate of candidates) {
    const key = [candidate.x, candidate.y, candidate.width, candidate.height].join(':')
    const previous = unique.get(key)
    if (!previous || candidate.area > previous.area) unique.set(key, candidate)
  }
  const available = [...unique.values()]
  const targetCenter = calibration
    ? { x: calibration.box.x - offsetX + calibration.box.width / 2, y: calibration.box.y - offsetY + calibration.box.height / 2 }
    : { x: width / 2, y: height / 2 }
  available.sort((a, b) => candidateScore(b, targetCenter, width, height) - candidateScore(a, targetCenter, width, height))
  return available[0] ?? null
}

function candidateScore(candidate: Candidate, targetCenter: { x: number; y: number }, width: number, height: number): number {
  const areaScore = Math.max(0, 4 - Math.abs(candidate.area - CLIP_TARGET_AREA) / CLIP_TARGET_AREA * 4)
  const aspect = candidate.width / candidate.height
  const aspectScore = Math.max(0, 2 - Math.abs(aspect - CLIP_AR_TARGET) * 2)
  const centerX = candidate.x + candidate.width / 2
  const centerY = candidate.y + candidate.height / 2
  const distance = Math.hypot(centerX - targetCenter.x, centerY - targetCenter.y)
  const centerScore = Math.max(0, 1 - distance / Math.max(width, height))
  return areaScore * 2 + aspectScore + centerScore
}

function cropGray(gray: Uint8Array, width: number, height: number, box: LineClampBox): { gray: Uint8Array; width: number; height: number; offsetX: number; offsetY: number } {
  const x = Math.max(0, Math.floor(box.x))
  const y = Math.max(0, Math.floor(box.y))
  const right = Math.min(width, Math.ceil(box.x + box.width))
  const bottom = Math.min(height, Math.ceil(box.y + box.height))
  const cropWidth = Math.max(0, right - x)
  const cropHeight = Math.max(0, bottom - y)
  const output = new Uint8Array(cropWidth * cropHeight)
  for (let row = 0; row < cropHeight; row += 1) output.set(gray.subarray((y + row) * width + x, (y + row) * width + right), row * cropWidth)
  return { gray: output, width: cropWidth, height: cropHeight, offsetX: x, offsetY: y }
}

function estimateAngle(gray: Uint8Array, width: number, height: number, component: BinaryComponent): number {
  let weight = 0
  let meanX = 0
  let meanY = 0
  for (let y = component.y; y < component.y + component.height; y += 1) {
    for (let x = component.x; x < component.x + component.width; x += 1) {
      if (gray[y * width + x] >= 140) continue
      weight += 1
      meanX += x
      meanY += y
    }
  }
  if (weight === 0) return 0
  meanX /= weight
  meanY /= weight
  let xx = 0
  let yy = 0
  let xy = 0
  for (let y = component.y; y < component.y + component.height; y += 1) {
    for (let x = component.x; x < component.x + component.width; x += 1) {
      if (gray[y * width + x] >= 140) continue
      const dx = x - meanX
      const dy = y - meanY
      xx += dx * dx
      yy += dy * dy
      xy += dx * dy
    }
  }
  let angle = Math.atan2(2 * xy, xx - yy) * 90 / Math.PI
  if (angle > 90) angle -= 180
  if (angle < -90) angle += 180
  return angle
}

function screwContrast(gray: Uint8Array, width: number, height: number, center: { x: number; y: number }): number {
  const innerRadius = 8
  const outerInnerRadius = 12
  const outerRadius = 24
  let innerSum = 0
  let innerCount = 0
  let outerSum = 0
  let outerCount = 0
  const minX = Math.max(0, Math.floor(center.x - outerRadius))
  const maxX = Math.min(width - 1, Math.ceil(center.x + outerRadius))
  const minY = Math.max(0, Math.floor(center.y - outerRadius))
  const maxY = Math.min(height - 1, Math.ceil(center.y + outerRadius))
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = Math.hypot(x - center.x, y - center.y)
      if (distance <= innerRadius) {
        innerSum += gray[y * width + x]
        innerCount += 1
      } else if (distance >= outerInnerRadius && distance <= outerRadius) {
        outerSum += gray[y * width + x]
        outerCount += 1
      }
    }
  }
  return innerCount && outerCount ? innerSum / innerCount - outerSum / outerCount : 0
}

function isImageData(value: LineClampImageData | undefined): value is LineClampImageData {
  return Boolean(value && Number.isInteger(value.width) && Number.isInteger(value.height) && value.width > 0 && value.height > 0 && value.data.length >= value.width * value.height * 4)
}

function failedResult(filename: string, width: number, height: number, error: string): LineClampDetectionResult {
  return {
    filename,
    width,
    height,
    center: { x: 0, y: 0 },
    angleDeg: 0,
    area: 0,
    success: false,
    hasScrew: false,
    screwContrast: 0,
    isTilted: false,
    status: 'failed',
    box: null,
    error,
  }
}
