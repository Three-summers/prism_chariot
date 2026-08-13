import { Activity, Crosshair, HeartPulse, ScanLine, Settings2, Shield, Thermometer } from 'lucide-react'
import { useAppSettings } from '../../app/AppSettingsProvider'
import type { ModuleIconId, ModuleId } from '../../modules/types'
import { MODULE_IDS, moduleDefinitions } from '../../modules/registry'
import { useI18n } from '../../i18n/I18nProvider'

const icons: Record<ModuleIconId, typeof ScanLine> = {
  scan: ScanLine,
  crosshair: Crosshair,
  plate: Activity,
  thermometer: Thermometer,
  heart: HeartPulse,
}

export function AppHeader({ activeModule, onModuleChange, timestamp }: { activeModule: ModuleId; onModuleChange(id: ModuleId): void; timestamp: string }) {
  const { t, locale } = useI18n()
  const { language, setLanguage, theme, setTheme } = useAppSettings()
  const date = new Date(timestamp.replace(' ', 'T'))
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date)

  return (
    <header className="topbar">
      <div className="brand">
        <img src="/resources/prism-logo.svg" alt="" />
        <div><strong>{t('brand.name')}</strong><small>{t('brand.subtitle')}</small></div>
      </div>
      <nav aria-label="Dashboard modules">
        {MODULE_IDS.map((id) => {
          const definition = moduleDefinitions[id]
          const Icon = icons[definition.icon]
          return (
            <button key={id} className={`module-tab ${activeModule === id ? 'active' : ''}`} data-accent={definition.accent} aria-pressed={activeModule === id} onClick={() => onModuleChange(id)}>
              <Icon size={17} />{t(definition.labelKey)}
            </button>
          )
        })}
      </nav>
      <div className="header-tools">
        <div className="setting-group" aria-label={t('actions.language')}>
          <button className={language === 'zh' ? 'active' : ''} onClick={() => setLanguage('zh')}>中</button>
          <button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
        </div>
        <label className="theme-control" title={t('actions.theme')}>
          <Settings2 size={14} />
          <select id="theme-select" name="theme" value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)} aria-label={t('actions.theme')}>
            <option value="dark">{t('settings.dark')}</option>
            <option value="light">{t('settings.light')}</option>
            <option value="high-contrast">{t('settings.highContrast')}</option>
          </select>
        </label>
      </div>
      <div className="top-status">
        <span>{timestamp}</span><span className="weekday">{weekday}</span>
        <span className="online"><i />{t('status.realtime')}</span>
      </div>
      <Shield className="header-shield" size={16} />
    </header>
  )
}
