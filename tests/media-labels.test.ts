import assert from 'node:assert/strict'
import test from 'node:test'
import { imageAltKeyForModule } from '../src/components/dashboard/mediaLabels.ts'

test('selects the module-specific accessible label for inspection images', () => {
  assert.equal(imageAltKeyForModule('lineClamp'), 'media.lineClampImage')
  assert.equal(imageAltKeyForModule('magneticPlate'), 'media.magneticPlateImage')
  assert.equal(imageAltKeyForModule('infraredTemperature'), 'media.infraredImage')
})
