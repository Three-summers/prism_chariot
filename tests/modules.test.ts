import assert from 'node:assert/strict'
import test from 'node:test'
import * as registry from '../src/modules/registry.ts'
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
    'lifeSensing',
    'infraredTemperature',
  ])
  assert.equal(new Set(MODULE_IDS).size, 5)
})

test('opens line clamp as the default dashboard module', () => {
  assert.equal((registry as Record<string, unknown>).DEFAULT_MODULE_ID, 'lineClamp')
})

test('gives each module one controlled overlay and complete panel definitions', () => {
  assert.deepEqual(
    MODULE_IDS.map((id) => moduleDefinitions[id].overlay),
    ['line-clamp', 'line-protrusion', 'magnetic-plate', 'vital-signs', 'infrared'],
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
