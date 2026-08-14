import type { TranslationKey } from '../../i18n/resources.ts'
import type { ModuleId } from '../../modules/types.ts'

const IMAGE_ALT_KEYS: Partial<Record<ModuleId, TranslationKey>> = {
  lineClamp: 'media.lineClampImage',
  magneticPlate: 'media.magneticPlateImage',
  infraredTemperature: 'media.infraredImage',
}

export function imageAltKeyForModule(moduleId: ModuleId): TranslationKey {
  return IMAGE_ALT_KEYS[moduleId] ?? 'media.lineClampImage'
}
