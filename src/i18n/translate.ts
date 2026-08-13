import type { Language } from '../app/settings.ts'
import { translationResources, type TranslationKey } from './resources.ts'

export type TranslationParams = Record<string, string | number>

export function translate(
  language: Language,
  key: TranslationKey,
  params: TranslationParams = {},
): string {
  const resource = translationResources[language] as Record<string, string>
  const template = resource[key] ?? String(key)

  return template.replace(/\{([\w]+)\}/g, (placeholder, name: string) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder
  ))
}
