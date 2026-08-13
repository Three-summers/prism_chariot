import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  parseSettings,
  serializeSettings,
} from '../src/app/settings.ts'

test('uses Chinese and dark theme when no stored settings exist', () => {
  assert.deepEqual(parseSettings(null), {
    version: 1,
    language: 'zh',
    theme: 'dark',
  })
  assert.equal(SETTINGS_STORAGE_KEY, 'prism-chariot.settings.v1')
})

test('preserves a complete valid version-one payload', () => {
  assert.deepEqual(
    parseSettings('{"version":1,"language":"en","theme":"high-contrast"}'),
    { version: 1, language: 'en', theme: 'high-contrast' },
  )
})

test('falls back for malformed, stale, or invalid settings', () => {
  const invalidPayloads = [
    '{',
    '{"version":2,"language":"en","theme":"light"}',
    '{"version":1,"language":"fr","theme":"dark"}',
    '{"version":1,"language":"zh","theme":"sepia"}',
    'null',
  ]

  for (const payload of invalidPayloads) {
    assert.deepEqual(parseSettings(payload), DEFAULT_SETTINGS)
  }
})

test('serializes settings to a stable versioned payload', () => {
  assert.equal(
    serializeSettings({ version: 1, language: 'en', theme: 'light' }),
    '{"version":1,"language":"en","theme":"light"}',
  )
})
