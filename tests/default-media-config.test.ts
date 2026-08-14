import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { MODULE_IDS } from '../src/modules/registry.ts'

async function loadConfig() {
  return import('../src/config/defaultMedia.ts').catch(() => null)
}

test('defines one default source for every dashboard module', async () => {
  const module = await loadConfig()

  assert.ok(module)
  assert.deepEqual(Object.keys(module.DEFAULT_MEDIA).sort(), [...MODULE_IDS].sort())
  assert.equal(module.DEFAULT_MEDIA.lifeSensing.kind, 'stream')
})

test('uses deployable public resource URLs for configured media', async () => {
  const module = await loadConfig()

  assert.ok(module)
  const media = Object.values(module.DEFAULT_MEDIA).filter((item) => item.kind !== 'stream')
  for (const item of media) {
    assert.match(item.src, /^\/resources\//)
    await access(resolve('public', item.src.slice(1)))
  }
})
