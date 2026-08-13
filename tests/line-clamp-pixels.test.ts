import assert from 'node:assert/strict'
import test from 'node:test'
import { closeBinaryMask, connectedComponents, grayScale, threshold } from '../src/lineClamp/pixels.ts'

test('converts RGBA pixels to luminance values', () => {
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255])
  assert.deepEqual(Array.from(grayScale(rgba, 3, 1)), [76, 150, 29])
})

test('thresholds dark pixels as foreground', () => {
  assert.deepEqual(Array.from(threshold(new Uint8Array([20, 80, 120]), 80)), [1, 0, 0])
  assert.deepEqual(Array.from(threshold(new Uint8Array([20, 80, 120]), 80, false)), [0, 0, 1])
})

test('closes a one-pixel gap with a bounded rectangular kernel', () => {
  const mask = new Uint8Array([
    1, 1, 0, 1, 1,
    1, 1, 0, 1, 1,
    1, 1, 0, 1, 1,
  ])
  assert.deepEqual(Array.from(closeBinaryMask(mask, 5, 3, 1)), [
    1, 1, 1, 1, 1,
    1, 1, 1, 1, 1,
    1, 1, 1, 1, 1,
  ])
})

test('finds eight-connected component bounds and area', () => {
  const mask = new Uint8Array([
    0, 1, 0, 0, 0,
    1, 1, 0, 0, 1,
    0, 0, 0, 1, 1,
    0, 0, 0, 0, 0,
    0, 0, 1, 0, 0,
  ])
  assert.deepEqual(connectedComponents(mask, 5, 5), [
    { x: 0, y: 0, width: 2, height: 2, area: 3 },
    { x: 3, y: 1, width: 2, height: 2, area: 3 },
    { x: 2, y: 4, width: 1, height: 1, area: 1 },
  ])
})
