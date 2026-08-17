import assert from 'node:assert/strict'
import test from 'node:test'
import { mockDashboardDataProvider } from '../src/data/DashboardDataProvider.ts'
import { MAGNETIC_PLATE_CONFIG } from '../src/magneticPlate/detector.ts'
import { mapMagneticPlateResult, neutralMagneticPlateDashboard } from '../src/magneticPlate/magneticPlateViewModel.ts'
import type { MagneticPlateDetectionResult } from '../src/magneticPlate/types.ts'

function detection(status: MagneticPlateDetectionResult['status']): MagneticPlateDetectionResult {
  return {
    width: 640,
    height: 480,
    status,
    roi: { x: 0, y: 0.56, width: 0.78, height: 0.22 },
    segments: status === 'failed' ? [] : status === 'normal'
      ? [{ x: 0.03, y: 0.65, width: 0.68, height: 0.04, centerY: 0.67, area: 4_800 }]
      : [
          { x: 0.02, y: 0.64, width: 0.34, height: 0.04, centerY: 0.66, area: 2_300 },
          { x: 0.39, y: 0.67, width: 0.35, height: 0.05, centerY: 0.695, area: 2_500 },
        ],
    gapPx: status === 'warped' ? 19 : 0,
    centerJumpPx: status === 'warped' ? 17 : 0,
    continuity: status === 'warped' ? 0.72 : status === 'normal' ? 1 : 0,
    ...(status === 'failed' ? { error: 'No valid horizontal stripe found' } : {}),
  }
}

test('maps a warped stripe into metrics, pixel trend, overlay geometry, and one real CASE', async () => {
  const base = await mockDashboardDataProvider.getDashboard('magneticPlate')
  const mapped = mapMagneticPlateResult(detection('warped'), base, 'blob:plate')

  assert.equal(mapped.media.kind, 'image')
  assert.equal(mapped.media.src, 'blob:plate')
  assert.equal(mapped.media.sourceWidth, 640)
  assert.equal(mapped.media.sourceHeight, 480)
  assert.equal(mapped.metrics.find((item) => item.labelKey === 'metrics.stripeSegments')?.value, '2')
  assert.equal(mapped.metrics.find((item) => item.labelKey === 'metrics.gapDistance')?.value, '19')
  assert.equal(mapped.metrics.find((item) => item.labelKey === 'metrics.continuity')?.value, '72')
  assert.equal(mapped.metrics.find((item) => item.labelKey === 'metrics.alertLevel')?.tone, 'danger')
  assert.equal(mapped.trend.unit, 'px')
  assert.equal(mapped.trend.series[0].values.at(-1), 19)
  assert.equal(mapped.trend.series[1].values.at(-1), 640 * MAGNETIC_PLATE_CONFIG.minGapRatio)
  assert.ok(mapped.trend.labels.slice(0, -1).every((label) => label === ''))
  assert.match(mapped.trend.labels.at(-1) ?? '', /^\d{2}:\d{2}:\d{2}$/)
  assert.notEqual(mapped.trend.labels.at(-1), base.trend.labels.at(-1))
  assert.deepEqual(mapped.overlay.detectionBox, detection('warped').roi)
  assert.equal(mapped.overlay.stripes?.length, 2)
  assert.ok(mapped.overlay.gap)
  assert.equal(mapped.cases.length, 1)
  assert.equal(mapped.cases[0].typeKey, 'event.magneticPlateWarped')
  assert.equal(mapped.defaultCaseId, mapped.cases[0].id)
})

test('maps a continuous stripe as normal without a fabricated CASE', async () => {
  const base = await mockDashboardDataProvider.getDashboard('magneticPlate')
  const mapped = mapMagneticPlateResult(detection('normal'), base, 'blob:normal')

  assert.equal(mapped.overlay.detailKey, 'overlay.magneticPlateNormal')
  assert.equal(mapped.overlay.stripes?.length, 1)
  assert.equal(mapped.overlay.gap, undefined)
  assert.equal(mapped.cases.length, 0)
  assert.equal(mapped.defaultCaseId, '')
  assert.equal(mapped.metrics.find((item) => item.labelKey === 'metrics.alertLevel')?.tone, 'success')
})

test('maps detector failure without fabricated stripe geometry or CASE data', async () => {
  const base = await mockDashboardDataProvider.getDashboard('magneticPlate')
  const mapped = mapMagneticPlateResult(detection('failed'), base, 'blob:failed')

  assert.equal(mapped.overlay.detailKey, 'overlay.magneticPlateDetectionFailed')
  assert.equal(mapped.overlay.stripes, undefined)
  assert.equal(mapped.overlay.gap, undefined)
  assert.equal(mapped.overlay.detectionBox, undefined)
  assert.equal(mapped.cases.length, 0)
  assert.equal(mapped.metrics.find((item) => item.labelKey === 'metrics.inspectionStatus')?.value, 'common.failed')
})

test('creates a neutral initial magnetic plate dashboard without mock anomalies', async () => {
  const base = await mockDashboardDataProvider.getDashboard('magneticPlate')
  const neutral = neutralMagneticPlateDashboard(base)

  assert.equal(neutral.cases.length, 0)
  assert.equal(neutral.defaultCaseId, '')
  assert.equal(neutral.metrics.find((item) => item.labelKey === 'metrics.stripeSegments')?.value, '-')
  assert.equal(neutral.trend.unit, 'px')
  assert.ok(neutral.trend.series.every((series) => series.values.every((value) => value === 0)))
  assert.ok(neutral.trend.labels.every((label) => label === ''))
  assert.equal(neutral.overlay.detailKey, 'overlay.magneticPlateWaiting')
  assert.equal(neutral.overlay.stripes, undefined)
})
