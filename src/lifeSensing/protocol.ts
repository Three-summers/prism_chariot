import type { MmWaveFrame, RadarPoint, TargetHeight, TrackedTarget, VitalSignsReading } from './types.ts'

const MAGIC_WORD = new Uint8Array([2, 1, 4, 3, 6, 5, 8, 7])
const HEADER_LENGTH = 40
const TLV_HEADER_LENGTH = 8
const TLV_POINT_CLOUD = 1020
const TLV_TRACKS = 1010
const TLV_HEIGHTS = 1012
const TLV_VITAL_SIGNS = 1040
const TRACK_LENGTH = 112
const HEIGHT_LENGTH = 12
const VITAL_SIGNS_LENGTH = 136
const POINT_UNITS_LENGTH = 20
const POINT_LENGTH = 8
const POINT_UNITS = { elevation: 0.01, azimuth: 0.01, doppler: 0.01, range: 0.01, snr: 0.1 }

interface EncodedTlv {
  type: number
  payload: Uint8Array
}

export class MmWaveStreamDecoder {
  readonly maxPacketLength: number
  parseErrorCount = 0
  private buffer: Uint8Array = new Uint8Array()

  constructor(maxPacketLength = 1024 * 1024) {
    this.maxPacketLength = maxPacketLength
  }

  push(chunk: Uint8Array): MmWaveFrame[] {
    if (chunk.length) this.buffer = concatBytes(this.buffer, chunk)
    const frames: MmWaveFrame[] = []

    while (this.buffer.length >= MAGIC_WORD.length) {
      const magicOffset = findMagic(this.buffer)
      if (magicOffset < 0) {
        this.buffer = this.buffer.slice(Math.max(0, this.buffer.length - MAGIC_WORD.length + 1))
        break
      }
      if (magicOffset > 0) this.buffer = this.buffer.slice(magicOffset)
      if (this.buffer.length < HEADER_LENGTH) break

      const header = viewOf(this.buffer)
      const totalLength = header.getUint32(12, true)
      if (totalLength < HEADER_LENGTH || totalLength > this.maxPacketLength || totalLength % 32 !== 0) {
        this.parseErrorCount += 1
        this.buffer = this.buffer.slice(1)
        continue
      }
      if (this.buffer.length < totalLength) break

      const packet = this.buffer.slice(0, totalLength)
      this.buffer = this.buffer.slice(totalLength)
      try {
        frames.push(parsePacket(packet))
      } catch {
        this.parseErrorCount += 1
      }
    }

    return frames
  }

  reset(): void {
    this.buffer = new Uint8Array()
  }
}

export function encodeMmWaveFrame(frame: MmWaveFrame): Uint8Array {
  const tlvs: EncodedTlv[] = []
  if (frame.points.length) tlvs.push({ type: TLV_POINT_CLOUD, payload: encodePoints(frame.points) })
  if (frame.tracks.length) tlvs.push({ type: TLV_TRACKS, payload: encodeTracks(frame.tracks) })
  if (frame.heights.length) tlvs.push({ type: TLV_HEIGHTS, payload: encodeHeights(frame.heights) })
  for (const vitalSigns of frame.vitalSigns) tlvs.push({ type: TLV_VITAL_SIGNS, payload: encodeVitalSigns(vitalSigns) })

  const contentLength = HEADER_LENGTH + tlvs.reduce((total, tlv) => total + TLV_HEADER_LENGTH + tlv.payload.length, 0)
  const totalLength = Math.ceil(contentLength / 32) * 32
  const packet = new Uint8Array(totalLength)
  packet.set(MAGIC_WORD)
  const view = viewOf(packet)
  view.setUint32(8, 0x01000000, true)
  view.setUint32(12, totalLength, true)
  view.setUint32(16, 0x000a6843, true)
  view.setUint32(20, frame.frameNumber, true)
  view.setUint32(24, frame.timestampCycles, true)
  view.setUint32(28, frame.points.length, true)
  view.setUint32(32, tlvs.length, true)
  view.setUint32(36, 0, true)

  let offset = HEADER_LENGTH
  for (const tlv of tlvs) {
    view.setUint32(offset, tlv.type, true)
    view.setUint32(offset + 4, tlv.payload.length, true)
    packet.set(tlv.payload, offset + TLV_HEADER_LENGTH)
    offset += TLV_HEADER_LENGTH + tlv.payload.length
  }
  return packet
}

function parsePacket(packet: Uint8Array): MmWaveFrame {
  const view = viewOf(packet)
  const frame: MmWaveFrame = {
    frameNumber: view.getUint32(20, true),
    timestampCycles: view.getUint32(24, true),
    points: [],
    tracks: [],
    heights: [],
    vitalSigns: [],
  }
  const numberOfTlvs = view.getUint32(32, true)
  let offset = HEADER_LENGTH
  for (let index = 0; index < numberOfTlvs; index += 1) {
    if (offset + TLV_HEADER_LENGTH > packet.length) throw new Error('Incomplete TLV header')
    const type = view.getUint32(offset, true)
    const length = view.getUint32(offset + 4, true)
    offset += TLV_HEADER_LENGTH
    if (length > packet.length - offset) throw new Error('TLV payload exceeds packet')
    const payload = packet.subarray(offset, offset + length)
    if (type === TLV_POINT_CLOUD) frame.points.push(...parsePoints(payload))
    else if (type === TLV_TRACKS) frame.tracks.push(...parseTracks(payload))
    else if (type === TLV_HEIGHTS) frame.heights.push(...parseHeights(payload))
    else if (type === TLV_VITAL_SIGNS) frame.vitalSigns.push(parseVitalSigns(payload))
    offset += length
  }
  return frame
}

function parsePoints(payload: Uint8Array): RadarPoint[] {
  if (payload.length < POINT_UNITS_LENGTH || (payload.length - POINT_UNITS_LENGTH) % POINT_LENGTH !== 0) {
    throw new Error('Invalid compressed point-cloud length')
  }
  const view = viewOf(payload)
  const elevationUnit = view.getFloat32(0, true)
  const azimuthUnit = view.getFloat32(4, true)
  const dopplerUnit = view.getFloat32(8, true)
  const rangeUnit = view.getFloat32(12, true)
  const snrUnit = view.getFloat32(16, true)
  const points: RadarPoint[] = []
  for (let offset = POINT_UNITS_LENGTH; offset < payload.length; offset += POINT_LENGTH) {
    const elevation = view.getInt8(offset) * elevationUnit
    const azimuth = view.getInt8(offset + 1) * azimuthUnit
    const doppler = view.getInt16(offset + 2, true) * dopplerUnit
    const range = view.getUint16(offset + 4, true) * rangeUnit
    const snr = view.getUint16(offset + 6, true) * snrUnit
    const horizontalRange = range * Math.cos(elevation)
    points.push({
      x: horizontalRange * Math.sin(azimuth),
      y: horizontalRange * Math.cos(azimuth),
      z: range * Math.sin(elevation),
      doppler,
      snr,
    })
  }
  return points
}

function parseTracks(payload: Uint8Array): TrackedTarget[] {
  if (payload.length % TRACK_LENGTH !== 0) throw new Error('Invalid target-list length')
  const view = viewOf(payload)
  const tracks: TrackedTarget[] = []
  for (let offset = 0; offset < payload.length; offset += TRACK_LENGTH) {
    tracks.push({
      id: view.getUint32(offset, true),
      x: view.getFloat32(offset + 4, true),
      y: view.getFloat32(offset + 8, true),
      z: view.getFloat32(offset + 12, true),
      velocityX: view.getFloat32(offset + 16, true),
      velocityY: view.getFloat32(offset + 20, true),
      velocityZ: view.getFloat32(offset + 24, true),
      accelerationX: view.getFloat32(offset + 28, true),
      accelerationY: view.getFloat32(offset + 32, true),
      accelerationZ: view.getFloat32(offset + 36, true),
      confidence: view.getFloat32(offset + 108, true),
    })
  }
  return tracks
}

function parseHeights(payload: Uint8Array): TargetHeight[] {
  if (payload.length % HEIGHT_LENGTH !== 0) throw new Error('Invalid height-list length')
  const view = viewOf(payload)
  const heights: TargetHeight[] = []
  for (let offset = 0; offset < payload.length; offset += HEIGHT_LENGTH) {
    heights.push({ id: view.getUint32(offset, true), maxZ: view.getFloat32(offset + 4, true), minZ: view.getFloat32(offset + 8, true) })
  }
  return heights
}

function parseVitalSigns(payload: Uint8Array): VitalSignsReading {
  if (payload.length !== VITAL_SIGNS_LENGTH) throw new Error('Invalid vital-signs length')
  const view = viewOf(payload)
  return {
    id: view.getUint16(0, true),
    rangeBin: view.getUint16(2, true),
    breathDeviation: view.getFloat32(4, true),
    heartRate: view.getFloat32(8, true),
    breathRate: view.getFloat32(12, true),
    heartWaveform: readFloatArray(view, 16, 15),
    breathWaveform: readFloatArray(view, 76, 15),
  }
}

function encodePoints(points: RadarPoint[]): Uint8Array {
  const payload = new Uint8Array(POINT_UNITS_LENGTH + points.length * POINT_LENGTH)
  const view = viewOf(payload)
  view.setFloat32(0, POINT_UNITS.elevation, true)
  view.setFloat32(4, POINT_UNITS.azimuth, true)
  view.setFloat32(8, POINT_UNITS.doppler, true)
  view.setFloat32(12, POINT_UNITS.range, true)
  view.setFloat32(16, POINT_UNITS.snr, true)
  points.forEach((point, index) => {
    const offset = POINT_UNITS_LENGTH + index * POINT_LENGTH
    const range = Math.hypot(point.x, point.y, point.z)
    const elevation = range === 0 ? 0 : Math.asin(point.z / range)
    const azimuth = Math.atan2(point.x, point.y)
    view.setInt8(offset, clampSigned(Math.round(elevation / POINT_UNITS.elevation), 8))
    view.setInt8(offset + 1, clampSigned(Math.round(azimuth / POINT_UNITS.azimuth), 8))
    view.setInt16(offset + 2, clampSigned(Math.round(point.doppler / POINT_UNITS.doppler), 16), true)
    view.setUint16(offset + 4, clampUnsigned(Math.round(range / POINT_UNITS.range), 16), true)
    view.setUint16(offset + 6, clampUnsigned(Math.round(point.snr / POINT_UNITS.snr), 16), true)
  })
  return payload
}

function encodeTracks(tracks: TrackedTarget[]): Uint8Array {
  const payload = new Uint8Array(tracks.length * TRACK_LENGTH)
  const view = viewOf(payload)
  tracks.forEach((track, index) => {
    const offset = index * TRACK_LENGTH
    view.setUint32(offset, track.id, true)
    const values = [track.x, track.y, track.z, track.velocityX, track.velocityY, track.velocityZ, track.accelerationX, track.accelerationY, track.accelerationZ]
    values.forEach((value, valueIndex) => view.setFloat32(offset + 4 + valueIndex * 4, value, true))
    view.setFloat32(offset + 104, 1, true)
    view.setFloat32(offset + 108, track.confidence, true)
  })
  return payload
}

function encodeHeights(heights: TargetHeight[]): Uint8Array {
  const payload = new Uint8Array(heights.length * HEIGHT_LENGTH)
  const view = viewOf(payload)
  heights.forEach((height, index) => {
    const offset = index * HEIGHT_LENGTH
    view.setUint32(offset, height.id, true)
    view.setFloat32(offset + 4, height.maxZ, true)
    view.setFloat32(offset + 8, height.minZ, true)
  })
  return payload
}

function encodeVitalSigns(vitalSigns: VitalSignsReading): Uint8Array {
  if (vitalSigns.heartWaveform.length !== 15 || vitalSigns.breathWaveform.length !== 15) {
    throw new Error('Vital-sign waveforms must each contain 15 values')
  }
  const payload = new Uint8Array(VITAL_SIGNS_LENGTH)
  const view = viewOf(payload)
  view.setUint16(0, vitalSigns.id, true)
  view.setUint16(2, vitalSigns.rangeBin, true)
  view.setFloat32(4, vitalSigns.breathDeviation, true)
  view.setFloat32(8, vitalSigns.heartRate, true)
  view.setFloat32(12, vitalSigns.breathRate, true)
  writeFloatArray(view, 16, vitalSigns.heartWaveform)
  writeFloatArray(view, 76, vitalSigns.breathWaveform)
  return payload
}

function readFloatArray(view: DataView, offset: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => view.getFloat32(offset + index * 4, true))
}

function writeFloatArray(view: DataView, offset: number, values: number[]): void {
  values.forEach((value, index) => view.setFloat32(offset + index * 4, value, true))
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function findMagic(bytes: Uint8Array): number {
  outer: for (let offset = 0; offset <= bytes.length - MAGIC_WORD.length; offset += 1) {
    for (let index = 0; index < MAGIC_WORD.length; index += 1) {
      if (bytes[offset + index] !== MAGIC_WORD[index]) continue outer
    }
    return offset
  }
  return -1
}

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  if (!first.length) return second.slice()
  const combined = new Uint8Array(first.length + second.length)
  combined.set(first)
  combined.set(second, first.length)
  return combined
}

function clampSigned(value: number, bits: number): number {
  const maximum = 2 ** (bits - 1) - 1
  return Math.max(-maximum - 1, Math.min(maximum, value))
}

function clampUnsigned(value: number, bits: number): number {
  return Math.max(0, Math.min(2 ** bits - 1, value))
}
