import { useEffect, useState } from 'react'
import type { DashboardCase, DashboardViewModel, ModuleDefinition } from '../../modules/types'
import { CaseTable } from './CaseTable'
import { LogPanel } from './LogPanel'
import { MapPanel } from './MapPanel'
import type { LineProtrusionControls } from './LineProtrusionMedia'
import { MediaPanel, type MagneticPlateControls } from './MediaPanel'
import { MetricsPanel } from './MetricsPanel'
import { ResolutionPanel } from './ResolutionPanel'

export interface BatchControls {
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'completed'
  current: number
  total: number
  intervalSeconds: number
  onPickDirectory(): Promise<boolean>
  onDirectoryFiles(files: FileList): void
  onIntervalChange(seconds: number): void
  onPause(): void
  onResume(): void
  onStop(): void
}

export function DashboardShell({ definition, viewModel, batchControls, lineProtrusionControls, magneticPlateControls, mediaError = false }: { definition: ModuleDefinition; viewModel: DashboardViewModel; batchControls?: BatchControls; lineProtrusionControls?: LineProtrusionControls; magneticPlateControls?: MagneticPlateControls; mediaError?: boolean }) {
  const [floorId, setFloorId] = useState(viewModel.map.defaultFloor)
  const [selectedCase, setSelectedCase] = useState<DashboardCase | undefined>(() => viewModel.cases.find((item) => item.id === viewModel.defaultCaseId) ?? viewModel.cases[0])
  useEffect(() => {
    setFloorId(viewModel.map.defaultFloor)
    setSelectedCase(viewModel.cases.find((item) => item.id === viewModel.defaultCaseId) ?? viewModel.cases[0])
  }, [viewModel.moduleId, viewModel.defaultCaseId, viewModel.map.defaultFloor, viewModel.cases])
  return <main className="dashboard" data-accent={definition.accent}>
    <aside className="left-column"><MapPanel floors={viewModel.map.floors} floorId={floorId} onFloorChange={setFloorId} /><LogPanel logs={viewModel.logs} /></aside>
    <section className="center-column"><MediaPanel viewModel={viewModel} batchControls={batchControls} lineProtrusionControls={lineProtrusionControls} magneticPlateControls={magneticPlateControls} mediaError={mediaError} /><CaseTable cases={viewModel.cases} selectedId={selectedCase?.id ?? ''} onSelect={setSelectedCase} /></section>
    <aside className="right-column"><MetricsPanel viewModel={viewModel} floorId={floorId} /><ResolutionPanel key={selectedCase?.id ?? 'empty'} selectedCase={selectedCase} defaults={viewModel.resolution} /></aside>
  </main>
}
