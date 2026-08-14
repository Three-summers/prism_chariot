import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_MEDIA } from '../src/config/defaultMedia.ts'
import { mockDashboardDataProvider } from '../src/data/DashboardDataProvider.ts'
import { MODULE_IDS, moduleDefinitions } from '../src/modules/registry.ts'

test('provides a complete dashboard view model for every module', async () => {
  for (const id of MODULE_IDS) {
    const dashboard = await mockDashboardDataProvider.getDashboard(id)

    assert.equal(dashboard.moduleId, id)
    assert.equal(dashboard.overlay.kind, moduleDefinitions[id].overlay)
    assert.deepEqual(dashboard.map.floors.map((floor) => floor.id), ['1F', '3F'])
    assert.ok(dashboard.map.floors.some((floor) => floor.id === dashboard.map.defaultFloor))
    assert.ok(dashboard.map.currentPoint.length > 0)
    assert.ok(dashboard.logs.length >= 6)
    assert.equal(dashboard.metrics.length, 8)
    assert.ok(dashboard.trend.series.length >= 2)
    assert.equal(dashboard.cases.length, 5)
    assert.ok(dashboard.cases.some((item) => item.id === dashboard.defaultCaseId))
    assert.equal(dashboard.cases[0].spot, dashboard.map.currentPoint)
    assert.ok(dashboard.resolution.conclusions.length >= 2)
    assert.ok(dashboard.resolution.operator.length > 0)
  }
})

test('returns isolated data so UI edits do not mutate mock fixtures', async () => {
  const first = await mockDashboardDataProvider.getDashboard('lifeSensing')
  first.metrics[0].value = 'changed'
  first.cases[0].owner = 'changed'

  const second = await mockDashboardDataProvider.getDashboard('lifeSensing')
  assert.notEqual(second.metrics[0].value, 'changed')
  assert.notEqual(second.cases[0].owner, 'changed')
})

test('applies configured image and video sources to dashboard media', async () => {
  for (const id of ['lineClamp', 'lineProtrusion', 'magneticPlate', 'infraredTemperature'] as const) {
    const dashboard = await mockDashboardDataProvider.getDashboard(id)
    const configured = DEFAULT_MEDIA[id]

    assert.equal(dashboard.media.kind, configured.kind)
    assert.equal(dashboard.media.src, configured.src)
    if (configured.kind === 'image') {
      assert.equal(dashboard.media.sourceWidth, configured.width)
      assert.equal(dashboard.media.sourceHeight, configured.height)
    }
  }
})

test('maps the infrared person target and body temperature into the dashboard', async () => {
  const dashboard = await mockDashboardDataProvider.getDashboard('infraredTemperature')
  const metrics = Object.fromEntries(dashboard.metrics.map((metric) => [metric.labelKey, metric.value]))

  assert.equal(dashboard.media.src, '/resources/infrared-person-sample.jpg')
  assert.equal(dashboard.media.sourceHeight, 1840)
  assert.deepEqual(dashboard.overlay.targets, [{
    id: 'P01',
    x: 0.43,
    y: 0.595,
    width: 0.42,
    height: 0.386,
    temperatureC: 38.6,
    state: 'alarm',
  }])
  assert.equal(metrics['metrics.currentTemperature'], '38.6')
  assert.equal(metrics['metrics.threshold'], '37.3')
})
