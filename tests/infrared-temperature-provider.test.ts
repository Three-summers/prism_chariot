import assert from 'node:assert/strict'
import test from 'node:test'
import { infraredTemperatureDataProvider } from '../src/infraredTemperature/infraredTemperatureDataProvider.ts'

test('restamps the infrared demo dashboard with the current clock', async () => {
  const dashboard = await infraredTemperatureDataProvider.getDashboard()

  assert.equal(dashboard.moduleId, 'infraredTemperature')
  assert.match(dashboard.timestamp, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  assert.equal(dashboard.trend.labels.length, 6)
  assert.ok(dashboard.trend.labels.every((label) => /^\d{2}:\d{2}:\d{2}$/.test(label)))
  assert.equal(dashboard.trend.series.length, 2)
})

test('keeps the measured mock values while regenerating the time axis', async () => {
  const dashboard = await infraredTemperatureDataProvider.getDashboard()

  assert.equal(dashboard.metrics.find((metric) => metric.labelKey === 'metrics.currentTemperature')?.value, '38.6')
  assert.equal(dashboard.metrics.find((metric) => metric.labelKey === 'metrics.deviceId')?.value, 'AN0111')
})
