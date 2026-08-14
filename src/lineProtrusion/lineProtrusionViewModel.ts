import type { TranslationKey } from '../i18n/resources.ts'
import type { DashboardCase, DashboardViewModel, MetricValue } from '../modules/types.ts'
import { formatTrendTime } from '../components/dashboard/trendGeometry.ts'
import type { LineProtrusionConfig, LineProtrusionDetectionResult, WireState } from './types.ts'

export function mapLineProtrusionResult(
  result: LineProtrusionDetectionResult,
  baseViewModel: DashboardViewModel,
  cases: DashboardCase[],
  config: LineProtrusionConfig,
  sourceUrl: string,
  playbackSeconds: number,
): DashboardViewModel {
  const maximumDeviation = result.wires.reduce((maximum, wire) => Math.max(maximum, Math.abs(wire.deviationDeg)), 0)
  const state = result.state === 'failed' ? 'alarm' : result.state
  const sampleLabel = formatTrendTime(playbackSeconds)
  const lastLabel = baseViewModel.trend.labels[baseViewModel.trend.labels.length - 1]
  const advanceWindow = lastLabel !== sampleLabel
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
      labels: updateWindow(baseViewModel.trend.labels, sampleLabel, advanceWindow),
      series: baseViewModel.trend.series.map((series, index) => ({
        ...series,
        values: updateWindow(series.values, index === 0 ? maximumDeviation : config.alarmDeg, advanceWindow),
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

function updateWindow<T>(values: T[], value: T, advance: boolean): T[] {
  if (values.length === 0) return [value]
  if (advance) return [...values.slice(1), value]
  return values.map((current, index) => index === values.length - 1 ? value : current)
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Number(value.toFixed(1)).toString()
}
