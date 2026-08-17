import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatTrendClock,
  formatTrendTime,
  makeTrendPoints,
  makeTrendScale,
  pickTrendLabels,
} from '../src/components/dashboard/trendGeometry.ts'

test('normalizes a series into the chart bounds', () => {
  assert.equal(makeTrendPoints([10, 20, 30], 0, 30, 300, 100), '0,66.67 150,33.33 300,0')
})

test('centers a constant series instead of emitting invalid coordinates', () => {
  assert.equal(makeTrendPoints([15, 15], 15, 15, 300, 100), '0,50 300,50')
})

test('returns an empty path for an empty series', () => {
  assert.equal(makeTrendPoints([], 0, 1, 300, 100), '')
})

test('builds readable y-axis ticks around the visible values', () => {
  assert.deepEqual(makeTrendScale([8, 10, 15, 18.6]), {
    minimum: 5,
    maximum: 20,
    ticks: [5, 10, 15, 20],
  })
  assert.deepEqual(makeTrendScale([5, 5]), {
    minimum: 4,
    maximum: 6,
    ticks: [4, 5, 6],
  })
})

test('formats sub-second video positions and keeps x-axis labels sparse', () => {
  assert.equal(formatTrendTime(72.34), '01:12.3')
  assert.deepEqual(
    pickTrendLabels(['00:00', '00:01', '00:02', '00:03', '00:04', '00:05'], 3),
    [
      { index: 0, label: '00:00' },
      { index: 3, label: '00:03' },
      { index: 5, label: '00:05' },
    ],
  )
})

test('formats wall-clock hours, minutes and seconds for live trend labels', () => {
  assert.equal(formatTrendClock(new Date(2026, 7, 17, 14, 5, 9)), '14:05:09')
})
