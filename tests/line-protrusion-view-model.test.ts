import assert from 'node:assert/strict'
import test from 'node:test'
import { mockDashboardDataProvider } from '../src/data/DashboardDataProvider.ts'
import { mapLineProtrusionResult } from '../src/lineProtrusion/lineProtrusionViewModel.ts'
import type { LineProtrusionConfig, LineProtrusionDetectionResult, WireState } from '../src/lineProtrusion/types.ts'
import type { DashboardCase } from '../src/modules/types.ts'

const config: LineProtrusionConfig = { warningDeg: 2, alarmDeg: 5, sensitivity: 1 }

function result(state: WireState = 'alarm'): LineProtrusionDetectionResult {
  return {
    width: 1280,
    height: 720,
    state,
    wires: [{
      wire: 0,
      spots: [{ x: 0.2, y: 0.5 }, { x: 0.5, y: 0.51 }, { x: 0.8, y: 0.5 }],
      deviationDeg: state === 'alarm' ? 6 : state === 'warning' ? 3 : 0,
      state,
    }],
  }
}

test('maps maximum wire deviation and geometry into line protrusion dashboard', async () => {
  const base = await mockDashboardDataProvider.getDashboard('lineProtrusion')
  const cases: DashboardCase[] = [{ ...base.cases[0], id: 'LPR-0001', typeKey: 'event.lineProtrusionAlarm' }]

  const mapped = mapLineProtrusionResult(result(), base, cases, config, 'blob:video')

  assert.equal(mapped.media.kind, 'video')
  assert.equal(mapped.media.src, 'blob:video')
  assert.equal(mapped.media.sourceWidth, 1280)
  assert.equal(mapped.media.sourceHeight, 720)
  assert.equal(mapped.metrics.find((item) => item.labelKey === 'metrics.protrusion')?.value, '6')
  assert.equal(mapped.metrics.find((item) => item.labelKey === 'metrics.protrusion')?.unit, '°')
  assert.equal(mapped.metrics.find((item) => item.labelKey === 'metrics.threshold')?.value, '5')
  assert.equal(mapped.metrics.find((item) => item.labelKey === 'metrics.eventLevel')?.tone, 'danger')
  assert.equal(mapped.trend.unit, '°')
  assert.equal(mapped.trend.series[0].values.at(-1), 6)
  assert.equal(mapped.trend.series[1].values.at(-1), 5)
  assert.equal(mapped.overlay.wires?.length, 1)
  assert.equal(mapped.overlay.wires?.[0].state, 'alarm')
  assert.equal(mapped.cases.length, 1)
  assert.equal(mapped.defaultCaseId, 'LPR-0001')
})

test('maps normal and failed frames without creating synthetic CASE records', async () => {
  const base = await mockDashboardDataProvider.getDashboard('lineProtrusion')
  const normal = mapLineProtrusionResult(result('ok'), base, [], config, 'blob:video')
  const failed = mapLineProtrusionResult({ width: 1280, height: 720, wires: [], state: 'failed', error: 'tracking failed' }, base, [], config, 'blob:video')

  assert.equal(normal.overlay.detailKey, 'overlay.protrusionNormal')
  assert.equal(normal.metrics.find((item) => item.labelKey === 'metrics.eventLevel')?.tone, 'success')
  assert.equal(normal.cases.length, 0)
  assert.equal(failed.overlay.detailKey, 'overlay.detectionFailed')
  assert.equal(failed.cases.length, 0)
})
