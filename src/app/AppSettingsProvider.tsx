import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  parseSettings,
  serializeSettings,
  type AppSettings,
  type Language,
  type ThemeId,
} from './settings'

interface AppSettingsContextValue extends AppSettings {
  setLanguage(language: Language): void
  setTheme(theme: ThemeId): void
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null)

function readInitialSettings(): AppSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS }
  return parseSettings(window.localStorage.getItem(SETTINGS_STORAGE_KEY))
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(readInitialSettings)

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(settings))
  }, [settings])

  const value = useMemo<AppSettingsContextValue>(() => ({
    ...settings,
    setLanguage: (language) => setSettings((current) => ({ ...current, language })),
    setTheme: (theme) => setSettings((current) => ({ ...current, theme })),
  }), [settings])

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>
}

export function useAppSettings(): AppSettingsContextValue {
  const context = useContext(AppSettingsContext)
  if (!context) throw new Error('useAppSettings must be used inside AppSettingsProvider')
  return context
}
