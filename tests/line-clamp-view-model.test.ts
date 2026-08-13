import assert from 'node:assert/strict'
import test from 'node:test'
import { mockDashboardDataProvider } from '../src/data/DashboardDataProvider.ts'
import { mapLineClampResult } from '../src/lineClamp/lineClampViewModel.ts'
import type { LineClampDetectionResult } from '../src/lineClamp/types.ts'

function result(overrides: Partial<LineClampDetectionResult> = {}): LineClampDetectionResult {
  return {
    filename: 'sample.jpg', width: 1280, height: 720,
    center: { x: 640, y: 360 }, angleDeg: 0.8, area: 46500,
    success: true, hasScrew: true, screwContrast: 36.4, isTilted: false,
    status: 'ok', box: { x: 501, y: 190, width: 278, height: 170 },
    ...overrides,
  }
}

test('maps an OK detection into the line-clamp dashboard contract', async () => {
  const base = await mockDashboardDataProvider.getDashboard('lineClamp')
  const mapped = mapLineClampResult(result(), base, 'blob:sample')

  assert.equal(mapped.moduleId, 'lineClamp')
  assert.equal(mapped.media.kind, 'image')
  assert.equal(mapped.media.src, 'blob:sample')
  assert.deepEqual(mapped.media.detectionBox, { x: 501 / 1280, y: 190 / 720, width: 278 / 1280, height: 170 / 720 })
  assert.equal(mapped.overlay.kind, 'line-clamp')
  assert.equal(mapped.overlay.detectionBox, mapped.media.detectionBox)
  assert.equal(mapped.cases[0].stateTone, 'confirmed')
  assert.equal(mapped.cases[0].typeKey, 'event.detectionNormal')
  assert.equal(mapped.cases[0].levelKey, 'common.normal')
  assert.equal(mapped.cases[0].color, 'green')
  assert.equal(mapped.metrics.find((item) => item.labelKey === 'metrics.anomalyCount')?.value, '0')
  assert.equal(mapped.metrics.find((item) => item.labelKey === 'metrics.alertLevel')?.tone, 'success')
})

test('maps missing screw and tilt into warning metrics and event semantics', async () => {
  const base = await mockDashboardDataProvider.getDashboard('lineClamp')
  const mapped = mapLineClampResult(result({ status: 'tilted-no-screw', hasScrew: false, isTilted: true, angleDeg: 8.2, screwContrast: -3.5 }), base)

  assert.equal(mapped.cases[0].stateTone, 'processing')
  assert.equal(mapped.cases[0].typeKey, 'event.tiltedScrewMissing')
  assert.equal(mapped.metrics.find((item) => item.labelKey === 'metrics.anomalyCount')?.value, '1')
  assert.equal(mapped.metrics.find((item) => item.labelKey === 'metrics.alertLevel')?.tone, 'danger')
  assert.equal(mapped.metrics.find((item) => item.labelKey === 'metrics.angle')?.value, '8.2')
  assert.equal(mapped.overlay.stats.some((stat) => stat.labelKey === 'overlay.screw'), true)
  assert.equal(mapped.overlay.detailKey, 'overlay.tiltedScrewMissing')
})

test('maps detector failure without hiding the dashboard shell', async () => {
  const base = await mockDashboardDataProvider.getDashboard('lineClamp')
  const mapped = mapLineClampResult(result({ success: false, status: 'failed', box: null, error: 'No suitable contour found' }), base)

  assert.equal(mapped.overlay.detailKey, 'overlay.detectionFailed')
  assert.equal(mapped.cases[0].stateTone, 'processing')
  assert.equal(mapped.cases[0].typeKey, 'event.detectionFailed')
  assert.equal(mapped.metrics.find((item) => item.labelKey === 'metrics.alertLevel')?.tone, 'danger')
})
