export type Language = 'zh' | 'en'
export type ThemeId = 'dark' | 'light' | 'high-contrast'

export interface AppSettings {
  version: 1
  language: Language
  theme: ThemeId
}

export const SETTINGS_STORAGE_KEY = 'prism-chariot.settings.v1'

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  language: 'zh',
  theme: 'dark',
}

const languages: readonly Language[] = ['zh', 'en']
const themes: readonly ThemeId[] = ['dark', 'light', 'high-contrast']

export function parseSettings(raw: string | null): AppSettings {
  if (!raw) return { ...DEFAULT_SETTINGS }

  try {
    const value: unknown = JSON.parse(raw)
    if (
      typeof value === 'object'
      && value !== null
      && 'version' in value
      && value.version === 1
      && 'language' in value
      && languages.includes(value.language as Language)
      && 'theme' in value
      && themes.includes(value.theme as ThemeId)
    ) {
      return {
        version: 1,
        language: value.language as Language,
        theme: value.theme as ThemeId,
      }
    }
  } catch {
    // A corrupted preference must never prevent the dashboard from loading.
  }

  return { ...DEFAULT_SETTINGS }
}

export function serializeSettings(settings: AppSettings): string {
  return JSON.stringify({
    version: 1,
    language: settings.language,
    theme: settings.theme,
  })
}
