import type {
  LineProtrusionConfig,
  LineProtrusionDetectionResult,
  LineProtrusionImageData,
  ProtrusionPoint,
  WireCalibration,
  WireDetection,
  WireState,
} from './types.ts'

export function findSpotsOnLine(
  image: LineProtrusionImageData,
  lineY: number,
  startX: number,
  endX: number,
): [ProtrusionPoint, ProtrusionPoint, ProtrusionPoint] | null {
  const left = Math.max(0, Math.min(image.width - 1, Math.floor(Math.min(startX, endX))))
  const right = Math.max(0, Math.min(image.width - 1, Math.floor(Math.max(startX, endX))))
  const length = right - left + 1
  if (length < 10 || image.width <= 0 || image.height <= 0) return null

  const y = Math.max(0, Math.min(image.height - 1, Math.round(lineY)))
  const bandTop = Math.max(0, y - 12)
  const bandBottom = Math.min(image.height - 1, y + 12)
  const profile = new Float64Array(length)
  for (let sourceY = bandTop; sourceY <= bandBottom; sourceY += 1) {
    for (let sourceX = left; sourceX <= right; sourceX += 1) {
      const offset = (sourceY * image.width + sourceX) * 4
      profile[sourceX - left] += luminance(image.data, offset)
    }
  }

  const third = Math.floor(length / 3)
  if (third < 1) return null
  const segments: Array<[number, number]> = [[0, third], [third, third * 2], [third * 2, length]]
  const spots: ProtrusionPoint[] = []
  for (const [segmentStart, segmentEnd] of segments) {
    let peak = segmentStart
    for (let index = segmentStart + 1; index < segmentEnd; index += 1) {
      if (profile[index] > profile[peak]) peak = index
    }
    if (profile[peak] <= 0) return null

    const windowStart = Math.max(segmentStart, peak - 4)
    const windowEnd = Math.min(segmentEnd - 1, peak + 4)
    let weightedX = 0
    let total = 0
    for (let index = windowStart; index <= windowEnd; index += 1) {
      weightedX += index * profile[index]
      total += profile[index]
    }
    if (total <= 0) return null
    spots.push({ x: left + weightedX / total, y })
  }

  return spots as [ProtrusionPoint, ProtrusionPoint, ProtrusionPoint]
}

function luminance(data: ArrayLike<number>, offset: number): number {
  return 0.299 * Number(data[offset] ?? 0)
    + 0.587 * Number(data[offset + 1] ?? 0)
    + 0.114 * Number(data[offset + 2] ?? 0)
}

export function classifyDeviation(deviationDeg: number, config: LineProtrusionConfig): WireState {
  const absolute = Math.abs(deviationDeg)
  const warning = Math.max(0, config.warningDeg)
  const alarm = Math.max(warning, config.alarmDeg)
  if (absolute >= alarm) return 'alarm'
  if (absolute >= warning) return 'warning'
  return 'ok'
}

export function detectLineProtrusion(
  image: LineProtrusionImageData,
  calibrations: WireCalibration[],
  config: LineProtrusionConfig,
): LineProtrusionDetectionResult {
  if (image.width <= 0 || image.height <= 0 || calibrations.length === 0) {
    return { width: image.width, height: image.height, wires: [], state: 'failed', error: 'Calibration is required' }
  }

  const gray = resizeToTrackingGray(image)
  const wires: WireDetection[] = []
  for (const calibration of calibrations) {
    const references = calibration.spots.map((spot) => ({
      x: clamp(spot.x * gray.width, 0, gray.width - 1),
      y: clamp(spot.y * gray.height, 0, gray.height - 1),
    })) as [ProtrusionPoint, ProtrusionPoint, ProtrusionPoint]
    const tracked = references.map((spot) => trackSpot(gray, spot))
    if (tracked.some((spot) => !spot)) continue

    const points = tracked as [ProtrusionPoint, ProtrusionPoint, ProtrusionPoint]
    points[0].y = references[0].y
    points[2].y = references[2].y
    const baselineOffset = references[1].y - (references[0].y + references[2].y) / 2
    const currentOffset = points[1].y - (points[0].y + points[2].y) / 2
    const sensitivity = Number.isFinite(config.sensitivity) ? config.sensitivity : 1
    const deviationDeg = (currentOffset - baselineOffset) * sensitivity
    wires.push({
      wire: calibration.wire,
      spots: points.map((spot) => ({ x: spot.x / gray.width, y: spot.y / gray.height })) as WireDetection['spots'],
      deviationDeg,
      state: classifyDeviation(deviationDeg, config),
    })
  }

  if (wires.length === 0) {
    return { width: image.width, height: image.height, wires, state: 'failed', error: 'Unable to track calibrated spots' }
  }
  const state: WireState = wires.some((wire) => wire.state === 'alarm')
    ? 'alarm'
    : wires.some((wire) => wire.state === 'warning') ? 'warning' : 'ok'
  return { width: image.width, height: image.height, wires, state }
}

interface GrayImage {
  data: Float64Array
  width: number
  height: number
}

function resizeToTrackingGray(image: LineProtrusionImageData): GrayImage {
  const width = Math.min(600, image.width)
  const height = Math.max(1, Math.round(width * image.height / image.width))
  const data = new Float64Array(width * height)
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor(y * image.height / height))
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor(x * image.width / width))
      data[y * width + x] = luminance(image.data, (sourceY * image.width + sourceX) * 4)
    }
  }
  return { data, width, height }
}

function trackSpot(image: GrayImage, reference: ProtrusionPoint): ProtrusionPoint | null {
  const centerX = Math.round(reference.x)
  const centerY = Math.round(reference.y)
  const left = Math.max(0, centerX - 50)
  const right = Math.min(image.width - 1, centerX + 50)
  const top = Math.max(0, centerY - 50)
  const bottom = Math.min(image.height - 1, centerY + 50)
  let maximum = 0
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) maximum = Math.max(maximum, image.data[y * image.width + x])
  }
  if (maximum <= 0) return null

  const threshold = maximum * 0.5
  let weightedX = 0
  let weightedY = 0
  let total = 0
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const brightness = image.data[y * image.width + x]
      if (brightness < threshold) continue
      const weight = brightness - threshold + 1
      weightedX += x * weight
      weightedY += y * weight
      total += weight
    }
  }
  return total > 0 ? { x: weightedX / total, y: weightedY / total } : null
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
