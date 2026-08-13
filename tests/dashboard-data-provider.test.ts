import assert from 'node:assert/strict'
import test from 'node:test'
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
