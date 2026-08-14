import assert from 'node:assert/strict'
import test from 'node:test'
import { lineProtrusionDataProvider } from '../src/lineProtrusion/lineProtrusionDataProvider.ts'

test('provides an isolated line protrusion dashboard with no Mock CASE records', async () => {
  const first = await lineProtrusionDataProvider.getDashboard()
  first.cases.push({} as never)
  const second = await lineProtrusionDataProvider.getDashboard()

  assert.equal(second.moduleId, 'lineProtrusion')
  assert.equal(second.cases.length, 0)
  assert.equal(second.defaultCaseId, '')
})
