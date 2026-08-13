import { Map } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import type { MapFloor } from '../../modules/types'
import { Panel } from './Panel'

function FactoryMap({ floor }: { floor: MapFloor }) {
  return (
    <svg viewBox="0 0 260 300" className="route-map" preserveAspectRatio="xMidYMid meet" aria-label={`Floor ${floor.id}`}>
      <defs><pattern id={`map-grid-${floor.id}`} width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" /></pattern></defs>
      <rect width="260" height="300" className="map-base" /><rect width="260" height="300" fill={`url(#map-grid-${floor.id})`} className="map-grid-pattern" />
      <g className="zone">{floor.zones.map((zone, index) => <g key={`${zone.id}-${index}`}><rect className={`zone-box${zone.current ? ' current' : ''}`} x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx="3" /><text x={zone.x + zone.width / 2} y={zone.y + zone.height / 2 + 4} textAnchor="middle">{zone.id}</text></g>)}</g>
      <g className="compass"><circle cx="232" cy="268" r="16" /><path d="M232 256 L235 268 L232 265 L229 268 Z" /><text x="232" y="252" textAnchor="middle">N</text></g>
      <path id={`track-${floor.id}`} className="route-track" d="M130 278 V214 C130 184 78 184 78 152 V92 C78 56 118 42 168 42 H220" />
      <path className="route-flow" d="M130 278 V214 C130 184 78 184 78 152 V92 C78 56 118 42 168 42 H220" />
      <path className="arrow" d="M220 42 v-12 m0 12 6-7 m-6 7-6-7" />
      <g className="vehicle"><circle r="12" className="vehicle-pulse" /><circle r="4.5" className="vehicle-dot" /><rect className="vehicle-label" x="-18" y="14" width="36" height="14" rx="2" /><text x="0" y="24" textAnchor="middle">GL-01</text><animateMotion dur="16s" repeatCount="indefinite" rotate="0"><mpath href={`#track-${floor.id}`} /></animateMotion></g>
    </svg>
  )
}

export function MapPanel({ floors, floorId, onFloorChange }: { floors: MapFloor[]; floorId: string; onFloorChange(id: string): void }) {
  const { t } = useI18n()
  const floor = floors.find((item) => item.id === floorId) ?? floors[0]
  return <Panel title={t('panels.factoryOverview')} icon={<Map size={15} />} className="map-panel"><div className="map-frame"><FactoryMap floor={floor} /><div className="floor-switch">{floors.map((item) => <button key={item.id} className={floorId === item.id ? 'active' : ''} onClick={() => onFloorChange(item.id)}>{item.id}</button>)}</div></div></Panel>
}
