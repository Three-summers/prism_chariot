import assert from 'node:assert/strict'
import test from 'node:test'
import { makeTrendPoints } from '../src/components/dashboard/trendGeometry.ts'

test('normalizes a series into the chart bounds', () => {
  assert.equal(makeTrendPoints([10, 20, 30], 0, 30, 300, 100), '0,66.67 150,33.33 300,0')
})

test('centers a constant series instead of emitting invalid coordinates', () => {
  assert.equal(makeTrendPoints([15, 15], 15, 15, 300, 100), '0,50 300,50')
})

test('returns an empty path for an empty series', () => {
  assert.equal(makeTrendPoints([], 0, 1, 300, 100), '')
})
