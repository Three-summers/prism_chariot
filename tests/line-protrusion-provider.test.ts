import assert from 'node:assert/strict'
import test from 'node:test'
import { LINE_PROTRUSION_TREND_WINDOW, lineProtrusionDataProvider } from '../src/lineProtrusion/lineProtrusionDataProvider.ts'

test('provides an isolated line protrusion dashboard with no Mock CASE records', async () => {
  const first = await lineProtrusionDataProvider.getDashboard()
  first.cases.push({} as never)
  const second = await lineProtrusionDataProvider.getDashboard()

  assert.equal(second.moduleId, 'lineProtrusion')
  assert.equal(second.cases.length, 0)
  assert.equal(second.defaultCaseId, '')
  assert.equal(second.metrics.find((item) => item.labelKey === 'metrics.protrusion')?.value, '0')
  assert.equal(second.metrics.find((item) => item.labelKey === 'metrics.eventLevel')?.value, 'common.normal')
  assert.equal(second.trend.series[0].values.length, LINE_PROTRUSION_TREND_WINDOW)
  assert.ok(second.trend.series[0].values.every((value) => value === 0))
  assert.ok(second.trend.series[1].values.every((value) => value === 5))
  assert.ok(second.trend.labels.every((label) => label === ''))
  assert.equal(second.overlay.wires?.length ?? 0, 0)
})
