import type { KeyboardEvent } from 'react'
import type { TranslationKey } from '../../i18n/resources'
import { useI18n } from '../../i18n/I18nProvider'
import type { DashboardViewModel } from '../../modules/types'
import type { LifeSensingStreamStatus, LifeState, PersonSnapshot } from '../../lifeSensing/types'

const ORIGIN_X = 400
const ORIGIN_Y = 460
const PIXELS_PER_METER = 70
const RANGES = [1, 2, 3, 4, 5, 6]

const stateKeys: Record<LifeState, TranslationKey> = {
  notDetected: 'life.state.notDetected',
  normal: 'life.state.normal',
  motionless: 'life.state.motionless',
  breathHold: 'life.state.breathHold',
  vitalsAbnormal: 'life.state.vitalsAbnormal',
  fallen: 'life.state.fallen',
}

const streamKeys: Record<LifeSensingStreamStatus, TranslationKey> = {
  connecting: 'life.stream.connecting',
  streaming: 'life.stream.streaming',
  stale: 'life.stream.stale',
  error: 'life.stream.error',
  stopped: 'life.stream.stopped',
}

export interface LifeSensingControls {
  onSelectPerson(personId: number): void
}

export function LifeSensingMedia({ viewModel, controls }: { viewModel: DashboardViewModel; controls: LifeSensingControls }) {
  const { t } = useI18n()
  const scene = viewModel.lifeSensing
  if (!scene) return null

  return <>
    <div className="live-heading life-heading">
      <span>{t('panels.liveView')}</span><b>|</b>
      <span>{scene.sourceKind === 'simulated' ? viewModel.media.deviceId : t('life.source.serial')}</span><b>|</b>
      <span className="live-stamp">{viewModel.timestamp}</span>
      <div className="life-target-switcher" aria-label={t('life.radar')}>{scene.people.map((person) => <button
        type="button"
        key={person.id}
        className={scene.selectedPersonId === person.id ? 'active' : ''}
        onClick={() => controls.onSelectPerson(person.id)}
      >{t('life.target', { id: person.id })}</button>)}</div>
      <span className={`life-stream-state ${scene.status}`}><i />{t(streamKeys[scene.status])}</span>
    </div>
    <div className="scene life-radar-scene">
      <svg viewBox="0 0 800 480" preserveAspectRatio="xMidYMid meet" role="img" aria-label={t('life.radar')}>
        <g className="life-radar-grid" aria-hidden="true">
          {RANGES.map((range) => <circle key={range} cx={ORIGIN_X} cy={ORIGIN_Y} r={range * PIXELS_PER_METER} />)}
          <line x1={ORIGIN_X} y1={ORIGIN_Y} x2="92" y2="40" />
          <line x1={ORIGIN_X} y1={ORIGIN_Y} x2="708" y2="40" />
          <line x1={ORIGIN_X} y1={ORIGIN_Y} x2={ORIGIN_X} y2="40" className="center-line" />
          {RANGES.map((range) => <text key={range} x={ORIGIN_X + 7} y={ORIGIN_Y - range * PIXELS_PER_METER + 13}>{t('life.range', { range })}</text>)}
        </g>
        <g className="life-point-cloud" aria-hidden="true">{scene.points.map((point, index) => <circle
          key={`${index}-${point.x.toFixed(2)}-${point.y.toFixed(2)}`}
          cx={radarX(point.x)} cy={radarY(point.y)} r={1.4 + Math.min(1.8, point.snr / 18)}
          style={{ opacity: Math.min(0.86, 0.2 + point.snr / 35) }}
        />)}</g>
        {scene.people.map((person) => <RadarTarget
          key={person.id}
          person={person}
          selected={scene.selectedPersonId === person.id}
          label={t('life.target', { id: person.id })}
          stateLabel={t(stateKeys[person.state])}
          onSelect={() => controls.onSelectPerson(person.id)}
        />)}
        <g className="life-radar-origin" aria-hidden="true">
          <path d="M400 438 L386 466 H414 Z" />
          <circle cx={ORIGIN_X} cy={ORIGIN_Y} r="25" />
          <circle cx={ORIGIN_X} cy={ORIGIN_Y} r="5" />
        </g>
      </svg>
      <div className="life-scene-summary">
        <span><b>{scene.people.length}</b> {t('common.detected')}</span>
        {scene.parseErrorCount > 0 ? <span className="danger-text">ERR {scene.parseErrorCount}</span> : null}
      </div>
    </div>
  </>
}

function RadarTarget({ person, selected, label, stateLabel, onSelect }: { person: PersonSnapshot; selected: boolean; label: string; stateLabel: string; onSelect(): void }) {
  const x = radarX(person.position.x)
  const y = radarY(person.position.y)
  const trajectory = person.trajectory.map((point) => `${radarX(point.x)},${radarY(point.y)}`).join(' ')
  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelect()
  }
  return <g className={`life-target ${person.state} ${selected ? 'selected' : ''}`}>
    {trajectory ? <polyline className="life-trajectory" points={trajectory} aria-hidden="true" /> : null}
    <g role="button" tabIndex={0} aria-label={`${label}: ${stateLabel}`} onClick={onSelect} onKeyDown={onKeyDown} transform={`translate(${x} ${y})`}>
      <circle className="target-pulse" r="27" />
      <circle className="target-body" r="13" />
      <circle className="target-core" r="4" />
      <text className="target-label" x="19" y="-8">{label}</text>
      <text className="target-state" x="19" y="9">{stateLabel}</text>
    </g>
  </g>
}

function radarX(value: number): number {
  return ORIGIN_X + value * PIXELS_PER_METER
}

function radarY(value: number): number {
  return ORIGIN_Y - value * PIXELS_PER_METER
}
