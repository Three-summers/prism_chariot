import assert from 'node:assert/strict'
import test from 'node:test'
import { encodeMmWaveFrame, MmWaveStreamDecoder } from '../src/lifeSensing/protocol.ts'
import type { MmWaveFrame } from '../src/lifeSensing/types.ts'

function fixture(frameNumber: number): MmWaveFrame {
  return {
    frameNumber,
    timestampCycles: frameNumber * 100,
    points: [{ x: 1, y: 2, z: 0.5, doppler: -0.25, snr: 18 }],
    tracks: [{
      id: 1,
      x: 1,
      y: 2,
      z: 0.8,
      velocityX: 0.1,
      velocityY: -0.2,
      velocityZ: 0,
      accelerationX: 0.01,
      accelerationY: 0.02,
      accelerationZ: 0,
      confidence: 0.96,
    }],
    heights: [{ id: 1, maxZ: 1.72, minZ: 0.08 }],
    vitalSigns: [{
      id: 1,
      rangeBin: 12,
      breathDeviation: 0.12,
      heartRate: 72,
      breathRate: 16,
      heartWaveform: Array.from({ length: 15 }, (_, index) => index / 20),
      breathWaveform: Array.from({ length: 15 }, (_, index) => -index / 30),
    }],
  }
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

test('parses all supported TLVs after a frame is split across chunks', () => {
  const bytes = encodeMmWaveFrame(fixture(7))
  const decoder = new MmWaveStreamDecoder()

  assert.equal(decoder.push(bytes.slice(0, 17)).length, 0)
  const frames = decoder.push(bytes.slice(17))

  assert.equal(frames.length, 1)
  assert.equal(frames[0].frameNumber, 7)
  assert.equal(frames[0].points.length, 1)
  assert.ok(Math.abs(frames[0].points[0].x - 1) < 0.03)
  assert.ok(Math.abs(frames[0].points[0].y - 2) < 0.03)
  assert.equal(frames[0].tracks[0].id, 1)
  assert.ok(Math.abs(frames[0].tracks[0].confidence - 0.96) < 0.0001)
  assert.ok(Math.abs(frames[0].heights[0].maxZ - 1.72) < 0.0001)
  assert.equal(frames[0].vitalSigns[0].heartWaveform.length, 15)
  assert.equal(frames[0].vitalSigns[0].breathWaveform.length, 15)
  assert.ok(Math.abs(frames[0].vitalSigns[0].breathWaveform[14] + 14 / 30) < 0.0001)
})

test('parses sticky frames and discards bytes before the magic word', () => {
  const decoder = new MmWaveStreamDecoder()
  const bytes = concat(new Uint8Array([9, 8, 7]), encodeMmWaveFrame(fixture(8)), encodeMmWaveFrame(fixture(9)))

  const frames = decoder.push(bytes)

  assert.deepEqual(frames.map((frame) => frame.frameNumber), [8, 9])
})

test('drops a frame with an invalid TLV length and resynchronizes', () => {
  const corrupted = encodeMmWaveFrame(fixture(10))
  new DataView(corrupted.buffer, corrupted.byteOffset, corrupted.byteLength).setUint32(44, corrupted.length, true)
  const decoder = new MmWaveStreamDecoder()

  const frames = decoder.push(concat(corrupted, encodeMmWaveFrame(fixture(11))))

  assert.deepEqual(frames.map((frame) => frame.frameNumber), [11])
  assert.equal(decoder.parseErrorCount, 1)
})

test('reset clears buffered partial data without resetting the error counter', () => {
  const bytes = encodeMmWaveFrame(fixture(12))
  const decoder = new MmWaveStreamDecoder()
  decoder.push(bytes.slice(0, 20))

  decoder.reset()

  assert.equal(decoder.push(bytes.slice(20)).length, 0)
  assert.equal(decoder.parseErrorCount, 0)
})
