import assert from 'node:assert/strict'
import test from 'node:test'
import { computeUiScale } from '../src/uiScale.ts'

test('keeps the design size at one-to-one scale', () => {
  assert.equal(computeUiScale(1600, 900), 1)
})

test('scales a 1920x1080 viewport by 1.2', () => {
  assert.equal(computeUiScale(1920, 1080), 1.2)
})

test('uses the smaller ratio for a non-16:9 viewport', () => {
  assert.equal(computeUiScale(1920, 1200), 1.2)
})

test('shrinks to the smaller viewport dimension', () => {
  assert.equal(computeUiScale(1280, 720), 0.8)
})

test('does not emit NaN or Infinity for invalid dimensions', () => {
  assert.equal(computeUiScale(0, 0), 0)
  assert.equal(computeUiScale(Number.NaN, 900), 0)
  assert.equal(computeUiScale(1600, Number.POSITIVE_INFINITY), 0)
})
