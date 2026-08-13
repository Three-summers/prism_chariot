import type { LineClampCalibration } from './types.ts'

interface RawCalibrationRecord {
  box_corners: unknown
  box_center: unknown
  box_size: unknown
  has_screw: unknown
  screw_pos: unknown
}

export function parseCalibrationRecord(filename: string, input: unknown): LineClampCalibration {
  if (!filename || typeof filename !== 'string' || !isRecord(input)) {
    throw new TypeError('Invalid calibration record')
  }
  const raw = input as unknown as RawCalibrationRecord
  const corners = parsePoints(raw.box_corners, 'box_corners')
  const center = parsePoint(raw.box_center, 'box_center')
  const size = parsePoint(raw.box_size, 'box_size')
  const screwPos = parsePoint(raw.screw_pos, 'screw_pos')
  if (typeof raw.has_screw !== 'boolean' || size[0] <= 0 || size[1] <= 0) {
    throw new TypeError(`Invalid calibration record for ${filename}`)
  }
  const xs = corners.map(([x]) => x)
  const ys = corners.map(([, y]) => y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const extentWidth = Math.max(...xs) - x
  const extentHeight = Math.max(...ys) - y
  // Corner extents are the pixel-space box; fall back to the explicit size for
  // degenerate/rounded corner data while retaining positive dimensions.
  const width = extentWidth > 0 ? extentWidth : size[0]
  const height = extentHeight > 0 ? extentHeight : size[1]
  if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) {
    throw new TypeError(`Invalid calibration record for ${filename}`)
  }
  return {
    filename: basename(filename),
    box: { x, y, width, height },
    screw: { x: screwPos[0], y: screwPos[1], expected: raw.has_screw },
  }
}

export function parseCalibrationData(input: unknown): Map<string, LineClampCalibration> {
  if (!isRecord(input)) throw new TypeError('Calibration data must be an object')
  const result = new Map<string, LineClampCalibration>()
  for (const [filename, record] of Object.entries(input)) {
    const calibration = parseCalibrationRecord(filename, record)
    result.set(basename(filename), calibration)
  }
  return result
}

export function basename(filename: string): string {
  const normalized = filename.replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePoint(value: unknown, field: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((item) => typeof item === 'number' && Number.isFinite(item))) {
    throw new TypeError(`Invalid calibration ${field}`)
  }
  return [value[0], value[1]]
}

function parsePoints(value: unknown, field: string): Array<[number, number]> {
  if (!Array.isArray(value) || value.length < 4) throw new TypeError(`Invalid calibration ${field}`)
  return value.map((point) => parsePoint(point, field))
}
