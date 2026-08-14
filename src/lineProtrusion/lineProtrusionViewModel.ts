import type { TranslationKey } from '../i18n/resources.ts'
import type { DashboardCase, DashboardViewModel, MetricValue } from '../modules/types.ts'
import type { LineProtrusionConfig, LineProtrusionDetectionResult, WireState } from './types.ts'

export function mapLineProtrusionResult(
  result: LineProtrusionDetectionResult,
  baseViewModel: DashboardViewModel,
  cases: DashboardCase[],
  config: LineProtrusionConfig,
  sourceUrl: string,
): DashboardViewModel {
  const maximumDeviation = result.wires.reduce((maximum, wire) => Math.max(maximum, Math.abs(wire.deviationDeg)), 0)
  const state = result.state === 'failed' ? 'alarm' : result.state
  return {
    ...baseViewModel,
    media: {
      ...baseViewModel.media,
      kind: 'video',
      src: sourceUrl,
      sourceWidth: result.width,
      sourceHeight: result.height,
    },
    metrics: baseViewModel.metrics.map((metric) => mapMetric(metric, maximumDeviation, state, config)),
    trend: {
      ...baseViewModel.trend,
      unit: '°',
      series: baseViewModel.trend.series.map((series, index) => ({
        ...series,
        values: replaceLast(series.values, index === 0 ? maximumDeviation : config.alarmDeg),
      })),
    },
    cases: [...cases],
    defaultCaseId: cases[cases.length - 1]?.id ?? '',
    overlay: {
      ...baseViewModel.overlay,
      detailKey: detailKey(result),
      stats: [
        { labelKey: 'overlay.protrusion', value: formatNumber(maximumDeviation), unit: '°' },
        { labelKey: 'metrics.threshold', value: formatNumber(config.alarmDeg), unit: '°' },
      ],
      wires: result.wires.map((wire) => ({ ...wire, spots: wire.spots.map((spot) => ({ ...spot })) as typeof wire.spots })),
    },
  }
}

function mapMetric(
  metric: MetricValue,
  maximumDeviation: number,
  state: WireState,
  config: LineProtrusionConfig,
): MetricValue {
  if (metric.labelKey === 'metrics.protrusion') {
    return { ...metric, value: formatNumber(maximumDeviation), unit: '°', tone: toneForState(state) }
  }
  if (metric.labelKey === 'metrics.threshold') {
    return { ...metric, value: formatNumber(config.alarmDeg), unit: '°' }
  }
  if (metric.labelKey === 'metrics.eventLevel') {
    return {
      ...metric,
      value: state === 'alarm' ? 'common.red' : state === 'warning' ? 'common.orange' : 'common.normal',
      tone: toneForState(state),
    }
  }
  return { ...metric }
}

function detailKey(result: LineProtrusionDetectionResult): TranslationKey {
  if (result.state === 'failed') return 'overlay.detectionFailed'
  if (result.state === 'alarm') return 'overlay.protrusionAlarm'
  if (result.state === 'warning') return 'overlay.protrusionWarning'
  return 'overlay.protrusionNormal'
}

function toneForState(state: WireState): MetricValue['tone'] {
  return state === 'alarm' ? 'danger' : state === 'warning' ? 'warning' : 'success'
}

function replaceLast(values: number[], value: number): number[] {
  if (values.length === 0) return [value]
  const next = [...values]
  next[next.length - 1] = value
  return next
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Number(value.toFixed(1)).toString()
}
