import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MODULE_IDS,
  getModuleDefinition,
  moduleDefinitions,
} from '../src/modules/registry.ts'

test('registers all five modules in the intended navigation order', () => {
  assert.deepEqual(MODULE_IDS, [
    'lineClamp',
    'lineProtrusion',
    'magneticPlate',
    'infraredTemperature',
    'lifeSensing',
  ])
  assert.equal(new Set(MODULE_IDS).size, 5)
})

test('gives each module one controlled overlay and complete panel definitions', () => {
  assert.deepEqual(
    MODULE_IDS.map((id) => moduleDefinitions[id].overlay),
    ['line-clamp', 'line-protrusion', 'magnetic-plate', 'infrared', 'vital-signs'],
  )

  for (const id of MODULE_IDS) {
    const definition = moduleDefinitions[id]
    assert.equal(definition.id, id)
    assert.equal(definition.providerKey, id)
    assert.equal(definition.metricSlots.length, 8)
    assert.ok(definition.trendSeries.length >= 2)
    assert.equal(definition.caseColumns.length, 8)
    assert.ok(definition.resolutionFields.length >= 4)
  }
})

test('falls back to life sensing for an unknown module value', () => {
  assert.equal(getModuleDefinition('not-a-module').id, 'lifeSensing')
  assert.equal(getModuleDefinition(null).id, 'lifeSensing')
})
