import assert from 'node:assert/strict'
import test from 'node:test'
import { LineProtrusionVideoSession } from '../src/lineProtrusion/videoSession.ts'
import type { WireCalibration } from '../src/lineProtrusion/types.ts'

const calibration: WireCalibration = {
  wire: 0,
  spots: [{ x: 0.2, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.8, y: 0.5 }],
}

const secondCalibration: WireCalibration = {
  wire: 1,
  spots: [{ x: 0.2, y: 0.7 }, { x: 0.5, y: 0.7 }, { x: 0.8, y: 0.7 }],
}

test('replaces video URLs, resets calibration, and releases the active URL', () => {
  const revoked: string[] = []
  const session = new LineProtrusionVideoSession({
    createObjectUrl: (file) => `blob:${file.size}`,
    revokeObjectUrl: (url) => revoked.push(url),
  })

  session.load(new Blob(['first'], { type: 'video/mp4' }))
  session.setCalibration(calibration)
  session.load(new Blob(['second-video'], { type: 'video/mp4' }))

  assert.equal(session.sourceUrl, 'blob:12')
  assert.equal(session.calibrations.length, 0)
  assert.deepEqual(revoked, ['blob:5'])

  session.dispose()
  assert.deepEqual(revoked, ['blob:5', 'blob:12'])
  assert.equal(session.sourceUrl, undefined)
  assert.equal(session.status, 'idle')
})

test('allows playback only after both wire calibrations and keeps explicit lifecycle states', () => {
  const session = new LineProtrusionVideoSession({
    createObjectUrl: () => 'blob:video',
    revokeObjectUrl: () => undefined,
  })
  session.load(new Blob(['video'], { type: 'video/mp4' }))

  assert.equal(session.start(), false)
  session.setCalibration(calibration)
  assert.equal(session.start(), false)
  session.setCalibration(secondCalibration)
  assert.equal(session.start(), true)
  assert.equal(session.status, 'running')
  session.pause()
  assert.equal(session.status, 'paused')
  assert.equal(session.start(), true)
  session.stop()
  assert.equal(session.status, 'stopped')
  session.complete()
  assert.equal(session.status, 'completed')
})
