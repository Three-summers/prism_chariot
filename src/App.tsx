import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { AppSettingsProvider } from './app/AppSettingsProvider'
import { AppHeader } from './components/dashboard/AppHeader'
import { DashboardShell, type BatchControls } from './components/dashboard/DashboardShell'
import type { LineProtrusionControls } from './components/dashboard/LineProtrusionMedia'
import { mockDashboardDataProvider } from './data/DashboardDataProvider'
import { I18nProvider, useI18n } from './i18n/I18nProvider'
import { LineClampBatchController, type DirectoryImage, type LineClampBatchStatus } from './lineClamp/directoryBatch'
import { imagesFromFileList, pickImageDirectory } from './lineClamp/directoryPicker'
import { lineClampDataProvider, type LineClampDashboardResult } from './lineClamp/lineClampDataProvider'
import { magneticPlateDataProvider } from './magneticPlate/magneticPlateDataProvider'
import { infraredTemperatureDataProvider } from './infraredTemperature/infraredTemperatureDataProvider'
import { LineProtrusionCaseTracker } from './lineProtrusion/caseTracker'
import { lineProtrusionDataProvider } from './lineProtrusion/lineProtrusionDataProvider'
import { mapLineProtrusionResult } from './lineProtrusion/lineProtrusionViewModel'
import { DEFAULT_MODULE_ID, moduleDefinitions } from './modules/registry'
import type { DashboardCase, DashboardViewModel, ModuleId } from './modules/types'
import { computeUiScale } from './uiScale'
import type { MagneticPlateControls } from './components/dashboard/MediaPanel'
import type { LifeSensingControls } from './components/dashboard/LifeSensingMedia'
import { lifeSensingDataProvider } from './lifeSensing/lifeSensingDataProvider'

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

interface BatchState {
  status: LineClampBatchStatus
  current: number
  total: number
  intervalSeconds: number
}

type BatchFrame = { kind: 'result'; result: LineClampDashboardResult } | { kind: 'failed' }

function DashboardApp() {
  useUiScale()
  const { t } = useI18n()
  const [activeModule, setActiveModule] = useState<ModuleId>(DEFAULT_MODULE_ID)
  const [viewModel, setViewModel] = useState<DashboardViewModel | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [batch, setBatch] = useState<BatchState>({ status: 'idle', current: 0, total: 0, intervalSeconds: 1 })
  const batchController = useRef(new LineClampBatchController())
  const lineProtrusionTracker = useRef(new LineProtrusionCaseTracker())
  const lineProtrusionCases = useRef<DashboardCase[]>([])
  const magneticPlateRequest = useRef(0)

  useEffect(() => {
    let cancelled = false
    setViewModel(null)
    setLoadError(false)
    if (activeModule === 'lineProtrusion') {
      lineProtrusionTracker.current.reset()
      lineProtrusionCases.current = []
    }
    if (activeModule === 'lifeSensing') {
      const unsubscribe = lifeSensingDataProvider.subscribe((data) => {
        if (!cancelled) setViewModel(data)
      })
      void lifeSensingDataProvider.start().catch((error: unknown) => {
        console.error('Life-sensing stream failed', error)
        if (!cancelled) setLoadError(true)
      })
      return () => {
        cancelled = true
        unsubscribe()
        lifeSensingDataProvider.stop()
      }
    }
    const request = activeModule === 'lineClamp'
      ? lineClampDataProvider.getDashboard().then((data) => ({ ...data, cases: [], defaultCaseId: '' }))
      : activeModule === 'lineProtrusion'
        ? lineProtrusionDataProvider.getDashboard()
        : activeModule === 'magneticPlate'
          ? magneticPlateDataProvider.getDashboard()
          : activeModule === 'infraredTemperature'
            ? infraredTemperatureDataProvider.getDashboard()
            : mockDashboardDataProvider.getDashboard(activeModule)
    request.then((data) => { if (!cancelled) setViewModel(data) }).catch((error: unknown) => {
      console.error('Dashboard data load failed', error)
      if (!cancelled) setLoadError(true)
    })
    return () => { cancelled = true }
  }, [activeModule])

  useEffect(() => () => {
    batchController.current.stop()
    lineClampDataProvider.dispose()
    magneticPlateDataProvider.dispose()
  }, [])

  async function startBatch(images: DirectoryImage[]) {
    if (images.length === 0) return
    batchController.current.stop()
    lineClampDataProvider.dispose()
    setLoadError(false)
    setBatch((current) => ({ ...current, status: 'running', current: 0, total: images.length }))
    setViewModel((current) => current ? { ...current, cases: [], defaultCaseId: '' } : current)
    const cases: DashboardCase[] = []
    let sequence = 0

    await batchController.current.run<BatchFrame>(images, async (item) => {
      try {
        return { kind: 'result', result: await lineClampDataProvider.inspect({ file: item.file, filename: item.relativePath }) }
      } catch (error) {
        console.error(`Line-clamp image failed: ${item.relativePath}`, error)
        return { kind: 'failed' }
      }
    }, {
      onFrame: (item, frame) => {
        sequence += 1
        const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
        if (frame.kind === 'failed') {
          cases.push(failedCase(sequence, item.relativePath, timestamp))
          setLoadError(true)
          setViewModel((current) => current ? withBatchCases(current, cases) : current)
          return
        }
        setLoadError(false)
        if (frame.result.detection.status !== 'ok') {
          cases.push(resultCase(frame.result.viewModel.cases[0], sequence, item.relativePath, timestamp))
        }
        setViewModel(withBatchCases(frame.result.viewModel, cases))
      },
      onProgress: (current, total) => setBatch((state) => ({ ...state, status: batchController.current.status, current, total })),
    })
    setBatch((state) => ({ ...state, status: batchController.current.status }))
  }

  async function chooseDirectory(): Promise<boolean> {
    try {
      const images = await pickImageDirectory()
      if (!images) return false
      void startBatch(images)
      return true
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return true
      console.error('Directory selection failed', error)
      setLoadError(true)
      return true
    }
  }

  function changeModule(moduleId: ModuleId) {
    if (activeModule === 'lineClamp' && moduleId !== 'lineClamp') {
      batchController.current.stop()
      lineClampDataProvider.dispose()
      setBatch((current) => ({ ...current, status: 'idle', current: 0, total: 0 }))
    }
    if (activeModule === 'magneticPlate' && moduleId !== 'magneticPlate') {
      magneticPlateRequest.current += 1
      magneticPlateDataProvider.dispose()
    }
    setActiveModule(moduleId)
  }

  const magneticPlateControls: MagneticPlateControls = {
    onImage: (file) => {
      const requestId = ++magneticPlateRequest.current
      setLoadError(false)
      void magneticPlateDataProvider.inspect(file).then((result) => {
        if (requestId !== magneticPlateRequest.current) return
        setViewModel((current) => current?.moduleId === 'magneticPlate' ? result.viewModel : current)
        setLoadError(result.detection.status === 'failed')
      }).catch((error: unknown) => {
        if (requestId !== magneticPlateRequest.current) return
        console.error('Magnetic-plate image failed', error)
        setLoadError(true)
      })
    },
  }

  const batchControls: BatchControls = {
    ...batch,
    onPickDirectory: chooseDirectory,
    onDirectoryFiles: (files) => { void startBatch(imagesFromFileList(files)) },
    onIntervalChange: (seconds) => {
      const intervalSeconds = Number.isFinite(seconds) ? Math.min(60, Math.max(0, seconds)) : 0
      batchController.current.intervalMs = intervalSeconds * 1_000
      setBatch((current) => ({ ...current, intervalSeconds }))
    },
    onPause: () => { batchController.current.pause(); setBatch((current) => ({ ...current, status: batchController.current.status })) },
    onResume: () => { batchController.current.resume(); setBatch((current) => ({ ...current, status: batchController.current.status })) },
    onStop: () => { batchController.current.stop(); setBatch((current) => ({ ...current, status: batchController.current.status })) },
  }

  const lineProtrusionControls: LineProtrusionControls = {
    onDetection: (result, config, sourceUrl, playbackSeconds) => {
      const timestamp = localTimestamp(new Date())
      const created = lineProtrusionTracker.current.next(result, timestamp)
      if (created.length) lineProtrusionCases.current = [...lineProtrusionCases.current, ...created]
      setViewModel((current) => current?.moduleId === 'lineProtrusion'
        ? mapLineProtrusionResult(result, current, lineProtrusionCases.current, config, sourceUrl, playbackSeconds)
        : current)
    },
    onReset: () => {
      lineProtrusionTracker.current.reset()
      lineProtrusionCases.current = []
      void lineProtrusionDataProvider.getDashboard().then((dashboard) => {
        setViewModel((current) => current?.moduleId === 'lineProtrusion' ? dashboard : current)
      })
    },
  }

  const lifeSensingControls: LifeSensingControls = {
    onSelectPerson: (personId) => lifeSensingDataProvider.selectPerson(personId),
  }

  const timestamp = viewModel?.timestamp ?? '2026-08-12 10:25:52'
  const definition = moduleDefinitions[activeModule]
  const dashboardReady = viewModel?.moduleId === activeModule
  return <div className="stage"><div className="app-shell">
    <AppHeader activeModule={activeModule} onModuleChange={changeModule} timestamp={timestamp} />
    {dashboardReady ? <DashboardShell definition={definition} viewModel={viewModel} batchControls={activeModule === 'lineClamp' ? batchControls : undefined} lineProtrusionControls={activeModule === 'lineProtrusion' ? lineProtrusionControls : undefined} magneticPlateControls={activeModule === 'magneticPlate' ? magneticPlateControls : undefined} lifeSensingControls={activeModule === 'lifeSensing' ? lifeSensingControls : undefined} mediaError={['lineClamp', 'magneticPlate'].includes(activeModule) && loadError} /> : <main className="dashboard-state" data-accent={definition.accent}>
      {loadError ? <><RefreshCw size={30} /><strong>{t('status.loadError')}</strong></> : <><span className="loading-ring" /><strong>{t('status.loading')}</strong></>}
    </main>}
  </div></div>
}

function withBatchCases(viewModel: DashboardViewModel, cases: DashboardCase[]): DashboardViewModel {
  return {
    ...viewModel,
    cases: [...cases],
    defaultCaseId: cases[cases.length - 1]?.id ?? '',
    metrics: viewModel.metrics.map((metric) => metric.labelKey === 'metrics.anomalyCount'
      ? { ...metric, value: String(cases.length), tone: cases.length ? 'danger' : 'success' }
      : metric),
  }
}

function resultCase(template: DashboardCase, sequence: number, relativePath: string, timestamp: string): DashboardCase {
  return { ...template, id: `LCL-${String(sequence).padStart(4, '0')}`, spot: relativePath, time: timestamp, updated: timestamp.slice(11) }
}

function failedCase(sequence: number, relativePath: string, timestamp: string): DashboardCase {
  return {
    id: `LCL-${String(sequence).padStart(4, '0')}`,
    levelKey: 'common.red', color: 'red', time: timestamp, spot: relativePath,
    typeKey: 'event.detectionFailed', stateKey: 'common.processing', stateTone: 'processing',
    owner: 'YZU', updated: timestamp.slice(11),
  }
}

function localTimestamp(date: Date): string {
  const parts = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()]
  return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')} ${String(parts[3]).padStart(2, '0')}:${String(parts[4]).padStart(2, '0')}:${String(parts[5]).padStart(2, '0')}`
}

export default function App() {
  return <AppSettingsProvider><I18nProvider><DashboardApp /></I18nProvider></AppSettingsProvider>
}
