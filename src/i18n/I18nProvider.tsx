import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useAppSettings } from '../app/AppSettingsProvider'
import { isTranslationKey, type TranslationKey } from './resources'
import { translate, type TranslationParams } from './translate'

interface I18nContextValue {
  language: 'zh' | 'en'
  locale: 'zh-CN' | 'en-US'
  t(key: TranslationKey, params?: TranslationParams): string
  text(value: string): string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const { language } = useAppSettings()
  const t = useCallback((key: TranslationKey, params?: TranslationParams) => translate(language, key, params), [language])
  const text = useCallback((value: string) => isTranslationKey(value) ? translate(language, value) : value, [language])
  const value = useMemo<I18nContextValue>(() => ({ language, locale: language === 'zh' ? 'zh-CN' : 'en-US', t, text }), [language, t, text])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside I18nProvider')
  return context
}
