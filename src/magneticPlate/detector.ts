import type {
  MagneticPlateConfig,
  MagneticPlateDetectionResult,
  MagneticPlateImageData,
  MagneticStripeSegment,
  NormalizedRect,
} from './types.ts'

export const MAGNETIC_PLATE_CONFIG: MagneticPlateConfig = {
  roi: { x: 0, y: 0.56, width: 0.78, height: 0.22 },
  brightnessFloor: 110,
  thresholdMix: 0.56,
  minAreaRatio: 0.004,
  minWidthRatio: 0.1,
  minAspectRatio: 2.2,
  normalWidthRatio: 0.48,
  warpedCombinedWidthRatio: 0.42,
  minGapRatio: 0.025,
  minCenterJumpRatio: 0.025,
  centerBreakWindowRatio: 0.015,
  centerBreakMinXRatio: 0.18,
  centerBreakMaxXRatio: 0.58,
}

interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

interface Component extends PixelRect {
  area: number
  centerY: number
}

export class MagneticPlateDetector {
  private readonly config: MagneticPlateConfig

  constructor(config: MagneticPlateConfig = MAGNETIC_PLATE_CONFIG) {
    this.config = config
  }

  detect(image: MagneticPlateImageData): MagneticPlateDetectionResult {
    if (!validImage(image)) return failed(image.width, image.height, this.config.roi, 'Invalid image data')

    const roi = pixelRect(this.config.roi, image.width, image.height)
    const luminance = readLuminance(image, roi)
    const threshold = adaptiveThreshold(luminance, this.config)
    const mask = Uint8Array.from(luminance, (value) => value >= threshold ? 1 : 0)
    const minimumArea = roi.width * roi.height * this.config.minAreaRatio
    let candidates = components(mask, roi.width, roi.height)
      .filter((item) => item.area >= minimumArea
        && item.width >= image.width * this.config.minWidthRatio
        && item.width / Math.max(1, item.height) >= this.config.minAspectRatio)
      .sort((left, right) => right.width - left.width)
      .slice(0, 2)
      .map((item) => ({ ...item, x: item.x + roi.x, y: item.y + roi.y }))
      .sort((left, right) => left.x - right.x)

    if (candidates.length === 0) return failed(image.width, image.height, this.config.roi, 'No valid horizontal stripe found')
    let bridgedBreak = false
    if (candidates.length === 1) {
      const split = splitBridgedStripe(candidates[0], mask, roi, image.width, image.height, this.config)
      if (split) {
        candidates = split
        bridgedBreak = true
      }
    }

    const normalized = candidates.map((item) => normalizeSegment(item, image.width, image.height))
    if (candidates.length === 1) {
      if (candidates[0].width < image.width * this.config.normalWidthRatio) {
        return failed(image.width, image.height, this.config.roi, 'Horizontal stripe is too short')
      }
      return result(image, this.config.roi, normalized, 'normal', 0, 0, 1)
    }

    const [left, right] = candidates
    const gapPx = Math.max(0, right.x - (left.x + left.width))
    const centerJumpPx = Math.abs(left.centerY - right.centerY)
    const combinedWidth = left.width + right.width
    const outerWidth = Math.max(left.x + left.width, right.x + right.width) - Math.min(left.x, right.x)
    const horizontalContinuity = Math.min(1, combinedWidth / Math.max(1, outerWidth))
    const heightScale = Math.max(2, (left.height + right.height) / 2)
    const continuity = horizontalContinuity / (1 + centerJumpPx / heightScale)
    const significantPair = combinedWidth >= image.width * this.config.warpedCombinedWidthRatio
    const isSplit = bridgedBreak || gapPx >= image.width * this.config.minGapRatio
      || centerJumpPx >= image.height * this.config.minCenterJumpRatio

    if (!significantPair) return failed(image.width, image.height, this.config.roi, 'Horizontal stripe coverage is insufficient')
    if (isSplit) return result(image, this.config.roi, normalized, 'warped', gapPx, centerJumpPx, continuity)

    const mergedWidth = Math.max(left.x + left.width, right.x + right.width) - left.x
    if (mergedWidth >= image.width * this.config.normalWidthRatio) {
      return result(image, this.config.roi, normalized, 'normal', gapPx, centerJumpPx, continuity)
    }
    return failed(image.width, image.height, this.config.roi, 'No trustworthy stripe geometry found')
  }
}

function splitBridgedStripe(
  component: Component,
  mask: Uint8Array,
  roi: PixelRect,
  imageWidth: number,
  imageHeight: number,
  config: MagneticPlateConfig,
): [Component, Component] | undefined {
  const window = Math.max(2, Math.round(imageWidth * config.centerBreakWindowRatio))
  const centers = new Map<number, number>()
  for (let x = component.x; x < component.x + component.width; x += 1) {
    let count = 0
    let sum = 0
    for (let y = component.y; y < component.y + component.height; y += 1) {
      const localX = x - roi.x
      const localY = y - roi.y
      if (localX < 0 || localX >= roi.width || localY < 0 || localY >= roi.height || !mask[localY * roi.width + localX]) continue
      count += 1
      sum += y
    }
    if (count) centers.set(x, sum / count)
  }

  const searchStart = Math.max(component.x + window, Math.floor(imageWidth * config.centerBreakMinXRatio))
  const searchEnd = Math.min(component.x + component.width - window - 1, Math.ceil(imageWidth * config.centerBreakMaxXRatio))
  let splitX = -1
  let largestJump = 0
  for (let x = searchStart; x <= searchEnd; x += 1) {
    const left = centers.get(x - window)
    const right = centers.get(x + window)
    if (left === undefined || right === undefined) continue
    const jump = Math.abs(right - left)
    if (jump > largestJump) {
      largestJump = jump
      splitX = x
    }
  }
  if (splitX < 0 || largestJump < imageHeight * config.minCenterJumpRatio) return undefined

  const bridgeHalfWidth = Math.max(1, Math.floor(window / 2))
  const left = componentInRange(mask, roi, component, component.x, splitX - bridgeHalfWidth)
  const right = componentInRange(mask, roi, component, splitX + bridgeHalfWidth, component.x + component.width - 1)
  if (!left || !right) return undefined
  if (left.width < imageWidth * config.minWidthRatio || right.width < imageWidth * config.minWidthRatio) return undefined
  return [left, right]
}

function componentInRange(
  mask: Uint8Array,
  roi: PixelRect,
  source: Component,
  startX: number,
  endX: number,
): Component | undefined {
  let area = 0
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let sumY = 0
  for (let y = source.y; y < source.y + source.height; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const localX = x - roi.x
      const localY = y - roi.y
      if (localX < 0 || localX >= roi.width || localY < 0 || localY >= roi.height || !mask[localY * roi.width + localX]) continue
      area += 1
      sumY += y
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  if (area === 0) return undefined
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area, centerY: sumY / area }
}

function result(
  image: MagneticPlateImageData,
  roi: NormalizedRect,
  segments: MagneticStripeSegment[],
  status: 'normal' | 'warped',
  gapPx: number,
  centerJumpPx: number,
  continuity: number,
): MagneticPlateDetectionResult {
  return { width: image.width, height: image.height, status, roi: { ...roi }, segments, gapPx, centerJumpPx, continuity }
}

function failed(width: number, height: number, roi: NormalizedRect, error: string): MagneticPlateDetectionResult {
  return { width, height, status: 'failed', roi: { ...roi }, segments: [], gapPx: 0, centerJumpPx: 0, continuity: 0, error }
}

function pixelRect(rect: NormalizedRect, width: number, height: number): PixelRect {
  const x = Math.max(0, Math.floor(rect.x * width))
  const y = Math.max(0, Math.floor(rect.y * height))
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.ceil(rect.width * width))),
    height: Math.max(1, Math.min(height - y, Math.ceil(rect.height * height))),
  }
}

function readLuminance(image: MagneticPlateImageData, roi: PixelRect): Uint8Array {
  const output = new Uint8Array(roi.width * roi.height)
  let destination = 0
  for (let y = roi.y; y < roi.y + roi.height; y += 1) {
    for (let x = roi.x; x < roi.x + roi.width; x += 1) {
      const source = (y * image.width + x) * 4
      output[destination] = Math.round(0.299 * image.data[source] + 0.587 * image.data[source + 1] + 0.114 * image.data[source + 2])
      destination += 1
    }
  }
  return output
}

function adaptiveThreshold(values: Uint8Array, config: MagneticPlateConfig): number {
  const histogram = new Uint32Array(256)
  for (const value of values) histogram[value] += 1
  const low = percentile(histogram, values.length, 0.65)
  const high = percentile(histogram, values.length, 0.98)
  return Math.max(config.brightnessFloor, low + (high - low) * config.thresholdMix)
}

function percentile(histogram: Uint32Array, total: number, ratio: number): number {
  const target = Math.max(1, Math.ceil(total * ratio))
  let count = 0
  for (let value = 0; value < histogram.length; value += 1) {
    count += histogram[value]
    if (count >= target) return value
  }
  return 255
}

function components(mask: Uint8Array, width: number, height: number): Component[] {
  const visited = new Uint8Array(mask.length)
  const output: Component[] = []
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x
      if (!mask[start] || visited[start]) continue
      visited[start] = 1
      const queue = [start]
      let area = 0
      let minX = x
      let maxX = x
      let minY = y
      let maxY = y
      let sumY = 0
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor]
        const currentX = index % width
        const currentY = Math.floor(index / width)
        area += 1
        sumY += currentY
        minX = Math.min(minX, currentX)
        maxX = Math.max(maxX, currentX)
        minY = Math.min(minY, currentY)
        maxY = Math.max(maxY, currentY)
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue
            const nextX = currentX + dx
            const nextY = currentY + dy
            if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue
            const next = nextY * width + nextX
            if (mask[next] && !visited[next]) {
              visited[next] = 1
              queue.push(next)
            }
          }
        }
      }
      output.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area, centerY: sumY / area })
    }
  }
  return output
}

function normalizeSegment(component: Component, width: number, height: number): MagneticStripeSegment {
  return {
    x: component.x / width,
    y: component.y / height,
    width: component.width / width,
    height: component.height / height,
    centerY: component.centerY / height,
    area: component.area,
  }
}

function validImage(image: MagneticPlateImageData): boolean {
  return Boolean(image && Number.isInteger(image.width) && Number.isInteger(image.height)
    && image.width > 0 && image.height > 0 && image.data.length >= image.width * image.height * 4)
}
