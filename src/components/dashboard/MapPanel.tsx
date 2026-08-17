import { Map } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import type { MapFloor } from '../../modules/types'
import { Panel } from './Panel'

function FactoryMap({ floor }: { floor: MapFloor }) {
  const route = 'M18 250 H72 V218 H130 V168 H218 V82 H188 V54 H130 V112 H72 V82 H42'
  const branchRows = [54, 82, 112, 184, 218, 250]
  const branchColumns = [42, 72, 102, 158, 188, 218]

  return (
    <svg viewBox="0 0 260 300" className="route-map" preserveAspectRatio="xMidYMid meet" aria-label={`Floor ${floor.id}`}>
      <defs><pattern id={`map-grid-${floor.id}`} width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" /></pattern></defs>
      <rect width="260" height="300" className="map-base" /><rect width="260" height="300" fill={`url(#map-grid-${floor.id})`} className="map-grid-pattern" />
      <g className="zone">{floor.zones.map((zone, index) => <rect key={`${zone.id}-${index}`} className={`zone-box${zone.current ? ' current' : ''}`} x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx="3" />)}</g>
      <g className="track-network" aria-hidden="true">
        <rect className="network-track" x="28" y="38" width="204" height="224" rx="8" />
        <path className="network-track" d="M130 38V262M28 150H232" />
        {branchRows.map((y) => <path key={`row-${y}`} className="network-track" d={`M28 ${y}H118M142 ${y}H232`} />)}
        {branchColumns.map((x) => <path key={`column-${x}`} className="network-track" d={`M${x} 38V138M${x} 162V262`} />)}
        {[54, 82, 112, 184, 218, 250].flatMap((y) => [42, 72, 102, 158, 188, 218].map((x) => <circle key={`${x}-${y}`} className="network-node" cx={x} cy={y} r="2.5" />))}
      </g>
      <g className="zone zone-labels">{floor.zones.map((zone, index) => <text key={`${zone.id}-${index}`} x={zone.x + 8} y={zone.y + 16}>{zone.id}</text>)}</g>
      <g className="compass"><circle cx="232" cy="268" r="16" /><path d="M232 256 L235 268 L232 265 L229 268 Z" /><text x="232" y="252" textAnchor="middle">N</text></g>
      <path id={`track-${floor.id}`} className="route-track" d={route} />
      <path className="route-flow" d={route} />
      <path className="arrow" d="M42 82H30m12 0-7-6m7 6-7 6" />
      <g className="vehicle"><circle r="12" className="vehicle-pulse" /><circle r="4.5" className="vehicle-dot" /><rect className="vehicle-label" x="-20" y="14" width="40" height="14" rx="2" /><text x="0" y="24" textAnchor="middle">AN0111</text><animateMotion dur="18s" repeatCount="indefinite" rotate="0"><mpath href={`#track-${floor.id}`} /></animateMotion></g>
    </svg>
  )
}

export function MapPanel({ floors, floorId, onFloorChange }: { floors: MapFloor[]; floorId: string; onFloorChange(id: string): void }) {
  const { t } = useI18n()
  const floor = floors.find((item) => item.id === floorId) ?? floors[0]
  return <Panel title={t('panels.factoryOverview')} icon={<Map size={15} />} className="map-panel"><div className="map-frame"><FactoryMap floor={floor} /><div className="floor-switch">{floors.map((item) => <button key={item.id} className={floorId === item.id ? 'active' : ''} onClick={() => onFloorChange(item.id)}>{item.id}</button>)}</div></div></Panel>
}
