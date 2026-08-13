import { useEffect, useLayoutEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { AppSettingsProvider } from './app/AppSettingsProvider'
import { AppHeader } from './components/dashboard/AppHeader'
import { DashboardShell } from './components/dashboard/DashboardShell'
import { mockDashboardDataProvider } from './data/DashboardDataProvider'
import { I18nProvider, useI18n } from './i18n/I18nProvider'
import { moduleDefinitions } from './modules/registry'
import type { DashboardViewModel, ModuleId } from './modules/types'
import { computeUiScale } from './uiScale'

function useUiScale() {
  useLayoutEffect(() => {
    const root = document.documentElement
    const previous = root.style.getPropertyValue('--ui-scale')
    const apply = () => root.style.setProperty('--ui-scale', String(computeUiScale(window.innerWidth, window.innerHeight)))
    apply()
    window.addEventListener('resize', apply)
    document.addEventListener('fullscreenchange', apply)
    return () => {
      window.removeEventListener('resize', apply)
      document.removeEventListener('fullscreenchange', apply)
      if (previous) root.style.setProperty('--ui-scale', previous)
      else root.style.removeProperty('--ui-scale')
    }
  }, [])
}

function DashboardApp() {
  useUiScale()
  const { t } = useI18n()
  const [activeModule, setActiveModule] = useState<ModuleId>('lifeSensing')
  const [viewModel, setViewModel] = useState<DashboardViewModel | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [requestVersion, setRequestVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    setViewModel(null)
    setLoadError(false)
    mockDashboardDataProvider.getDashboard(activeModule).then((data) => {
      if (!cancelled) setViewModel(data)
    }).catch(() => {
      if (!cancelled) setLoadError(true)
    })
    return () => { cancelled = true }
  }, [activeModule, requestVersion])

  const timestamp = viewModel?.timestamp ?? '2026-08-12 10:25:52'
  const definition = moduleDefinitions[activeModule]
  const dashboardReady = viewModel?.moduleId === activeModule
  return <div className="stage"><div className="app-shell">
    <AppHeader activeModule={activeModule} onModuleChange={setActiveModule} timestamp={timestamp} />
    {dashboardReady ? <DashboardShell key={activeModule} definition={definition} viewModel={viewModel} /> : <main className="dashboard-state" data-accent={definition.accent}>
      {loadError ? <><RefreshCw size={30} /><strong>{t('status.loadError')}</strong><button type="button" onClick={() => setRequestVersion((value) => value + 1)}>{t('actions.retry')}</button></> : <><span className="loading-ring" /><strong>{t('status.loading')}</strong></>}
    </main>}
  </div></div>
}

export default function App() {
  return <AppSettingsProvider><I18nProvider><DashboardApp /></I18nProvider></AppSettingsProvider>
}
