import type { DashboardCase, DashboardViewModel, MetricValue } from '../modules/types.ts'
import type { LifeSensingSnapshot, LifeSensingStreamStatus, LifeState, PersonSnapshot } from './types.ts'

export function mapLifeSensingSnapshot(
  base: DashboardViewModel,
  snapshot: LifeSensingSnapshot,
  cases: DashboardCase[],
  selectedPersonId: number | null,
  status: LifeSensingStreamStatus = 'streaming',
  parseErrorCount = 0,
  sourceKind: 'simulated' | 'serial' = 'simulated',
): DashboardViewModel {
  const selected = snapshot.people.find((person) => person.id === selectedPersonId) ?? snapshot.people[0]

  return {
    ...base,
    timestamp: formatTimestamp(snapshot.receivedAtMs),
    metrics: base.metrics.map((metric) => mapMetric(metric, selected)),
    trend: {
      ...base.trend,
      unit: '',
      labels: waveformLabels(selected?.breathWaveform.length ?? 0),
      series: base.trend.series.map((series, index) => ({
        ...series,
        values: (index === 0 ? selected?.breathWaveform ?? [] : selected?.heartWaveform ?? []).map(normalizeSample),
      })),
    },
    cases: cases.map((item) => ({ ...item })),
    defaultCaseId: cases[cases.length - 1]?.id ?? '',
    overlay: {
      ...base.overlay,
      detailKey: stateDetailKey(selected?.state),
      stats: [
        { labelKey: 'overlay.breathing', value: formatValue(selected?.breathRate), unit: 'bpm' },
        { labelKey: 'overlay.heart', value: formatValue(selected?.heartRate), unit: 'bpm' },
        { labelKey: 'overlay.radar', value: '77', unit: 'GHz' },
      ],
    },
    lifeSensing: {
      sourceKind,
      status,
      parseErrorCount,
      selectedPersonId: selected?.id ?? null,
      points: snapshot.points.map((point) => ({ ...point })),
      people: snapshot.people.map(clonePerson),
    },
  }
}

function mapMetric(metric: MetricValue, person: PersonSnapshot | undefined): MetricValue {
  const state = person?.state ?? 'notDetected'
  const tone = toneForState(state)
  if (metric.labelKey === 'metrics.frontDistance') {
    return { ...metric, value: person ? formatValue(Math.hypot(person.position.x, person.position.y)) : '-', unit: 'm' }
  }
  if (metric.labelKey === 'metrics.speed') {
    return { ...metric, value: person ? formatValue(person.speed) : '-', unit: 'm/s' }
  }
  if (metric.labelKey === 'metrics.breathing') {
    return { ...metric, value: formatValue(person?.breathRate), unit: 'bpm', tone, detected: Boolean(person) }
  }
  if (metric.labelKey === 'metrics.heartRate') {
    return { ...metric, value: formatValue(person?.heartRate), unit: 'bpm', tone, detected: Boolean(person) }
  }
  if (metric.labelKey === 'metrics.lifeStatus') {
    return { ...metric, value: state === 'normal' ? 'common.normal' : 'common.abnormal', unit: undefined, tone }
  }
  if (metric.labelKey === 'metrics.eventLevel') {
    return {
      ...metric,
      value: state === 'fallen' ? 'common.red' : isAnomaly(state) ? 'common.orange' : 'common.normal',
      unit: undefined,
      tone,
    }
  }
  return { ...metric }
}

function clonePerson(person: PersonSnapshot): PersonSnapshot {
  return {
    ...person,
    position: { ...person.position },
    heartWaveform: [...person.heartWaveform],
    breathWaveform: [...person.breathWaveform],
    trajectory: person.trajectory.map((point) => ({ ...point })),
  }
}

function waveformLabels(length: number): string[] {
  return Array.from({ length }, (_, index) => `${((index - length + 1) / 10).toFixed(1)}s`)
}

function formatTimestamp(value: number): string {
  const date = new Date(value)
  const parts = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
  return `${parts[0]}-${parts[1]}-${parts[2]} ${parts[3]}:${parts[4]}:${parts[5]}`
}

function formatValue(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '-'
  return Number(value.toFixed(1)).toString()
}

function normalizeSample(value: number): number {
  return Number(value.toFixed(6))
}

function isAnomaly(state: LifeState): boolean {
  return state !== 'normal' && state !== 'notDetected'
}

function toneForState(state: LifeState): MetricValue['tone'] {
  if (state === 'fallen') return 'danger'
  if (isAnomaly(state)) return 'warning'
  return state === 'normal' ? 'success' : 'normal'
}

function stateDetailKey(state: LifeState | undefined): DashboardViewModel['overlay']['detailKey'] {
  if (state === 'fallen' || state === 'vitalsAbnormal') return 'event.personFallen'
  if (state === 'motionless') return 'event.personStill'
  if (state === 'breathHold') return 'event.vitalsWeak'
  return 'common.normal'
}
