import assert from 'node:assert/strict'
import test from 'node:test'
import { translationResources } from '../src/i18n/resources.ts'
import { translate } from '../src/i18n/translate.ts'

test('translates representative navigation, panel, and action labels', () => {
  assert.equal(translate('zh', 'modules.lifeSensing'), '生命感知')
  assert.equal(translate('en', 'modules.lifeSensing'), 'Life Sensing')
  assert.equal(translate('zh', 'panels.caseRecords'), 'CASE记录')
  assert.equal(translate('en', 'actions.confirmResolution'), 'Confirm resolution')
})

test('translates life-sensing stream, target, and state labels', () => {
  assert.equal(translate('zh', 'life.source.simulated'), '模拟串口')
  assert.equal(translate('en', 'life.source.simulated'), 'Simulated serial')
  assert.equal(translate('zh', 'life.state.fallen'), '人员跌倒')
  assert.equal(translate('en', 'life.target', { id: 2 }), 'Person 2')
})

test('interpolates named values without changing unknown placeholders', () => {
  assert.equal(translate('zh', 'table.recordCount', { count: 5 }), '共 5 条记录')
  assert.equal(translate('en', 'table.recordCount', { count: 5 }), '5 records')
  assert.equal(translate('en', 'table.recordCount'), '{count} records')
})

test('keeps Chinese and English resource key sets identical', () => {
  assert.deepEqual(
    Object.keys(translationResources.en).sort(),
    Object.keys(translationResources.zh).sort(),
  )
})

test('falls back to the requested key when a translation is unavailable', () => {
  assert.equal(translate('en', 'missing.key' as never), 'missing.key')
})
