import type { TranslationKey } from '../i18n/resources.ts'
import type { DashboardCase, DashboardViewModel, DetectionGap, MetricValue } from '../modules/types.ts'
import { MAGNETIC_PLATE_CONFIG } from './detector.ts'
import type { MagneticPlateDetectionResult } from './types.ts'

export function neutralMagneticPlateDashboard(base: DashboardViewModel): DashboardViewModel {
  return {
    ...base,
    cases: [],
    defaultCaseId: '',
    metrics: base.metrics.map((metric) => neutralMetric(metric)),
    trend: {
      ...base.trend,
      titleKey: 'trend.gapDistance',
      unit: 'px',
      series: base.trend.series.map((series, index) => ({
        ...series,
        labelKey: index === 0 ? 'trend.gapDistance' : 'trend.threshold',
        values: series.values.map(() => 0),
      })),
    },
    overlay: {
      ...base.overlay,
      titleKey: 'overlay.magneticPlateInspection',
      detailKey: 'overlay.magneticPlateWaiting',
      stats: [
        { labelKey: 'overlay.stripeSegments', value: '-' },
        { labelKey: 'overlay.gapDistance', value: '-', unit: 'px' },
        { labelKey: 'overlay.continuity', value: '-', unit: '%' },
      ],
      detectionBox: undefined,
      stripes: undefined,
      gap: undefined,
    },
  }
}

export function mapMagneticPlateResult(
  result: MagneticPlateDetectionResult,
  baseViewModel: DashboardViewModel,
  sourceUrl?: string,
): DashboardViewModel {
  const anomaly = result.status === 'warped'
  const failed = result.status === 'failed'
  const gapThreshold = result.width * MAGNETIC_PLATE_CONFIG.minGapRatio
  const cases = anomaly ? [makeCase(baseViewModel)] : []
  return {
    ...baseViewModel,
    media: {
      ...baseViewModel.media,
      ...(sourceUrl ? { kind: 'image' as const, src: sourceUrl } : {}),
      ...(result.width > 0 && result.height > 0 ? { sourceWidth: result.width, sourceHeight: result.height } : {}),
      detectionBox: failed ? undefined : { ...result.roi },
    },
    metrics: baseViewModel.metrics.map((metric) => mapMetric(metric, result)),
    trend: {
      ...baseViewModel.trend,
      titleKey: 'trend.gapDistance',
      unit: 'px',
      series: baseViewModel.trend.series.map((series, index) => ({
        ...series,
        labelKey: index === 0 ? 'trend.gapDistance' : 'trend.threshold',
        values: roll(series.values, index === 0 ? result.gapPx : gapThreshold),
      })),
    },
    cases,
    defaultCaseId: cases[0]?.id ?? '',
    overlay: {
      ...baseViewModel.overlay,
      titleKey: 'overlay.magneticPlateInspection',
      detailKey: detailKey(result.status),
      stats: [
        { labelKey: 'overlay.stripeSegments', value: String(result.segments.length) },
        { labelKey: 'overlay.gapDistance', value: formatNumber(result.gapPx), unit: 'px' },
        { labelKey: 'overlay.continuity', value: formatNumber(result.continuity * 100), unit: '%' },
      ],
      detectionBox: failed ? undefined : { ...result.roi },
      stripes: failed ? undefined : result.segments.map((segment) => ({
        x: segment.x,
        y: segment.y,
        width: segment.width,
        height: segment.height,
        state: anomaly ? 'warped' : 'normal',
      })),
      gap: anomaly ? makeGap(result) : undefined,
    },
  }
}

function neutralMetric(metric: MetricValue): MetricValue {
  if (metric.labelKey === 'metrics.deviceStatus') return { ...metric, labelKey: 'metrics.inspectionStatus', value: 'common.inspecting', tone: 'normal' }
  if (metric.labelKey === 'metrics.plateTemperature') return { ...metric, labelKey: 'metrics.stripeSegments', value: '-', unit: undefined, tone: 'normal' }
  if (metric.labelKey === 'metrics.offset') return { ...metric, labelKey: 'metrics.gapDistance', value: '-', unit: 'px', tone: 'normal' }
  if (metric.labelKey === 'metrics.integrity') return { ...metric, labelKey: 'metrics.continuity', value: '-', unit: '%', tone: 'normal' }
  if (metric.labelKey === 'metrics.alertLevel') return { ...metric, value: 'common.normal', unit: undefined, tone: 'normal' }
  return { ...metric }
}

function mapMetric(metric: MetricValue, result: MagneticPlateDetectionResult): MetricValue {
  const statusTone: MetricValue['tone'] = result.status === 'normal' ? 'success' : 'danger'
  if (metric.labelKey === 'metrics.deviceStatus' || metric.labelKey === 'metrics.inspectionStatus') {
    return { ...metric, labelKey: 'metrics.inspectionStatus', value: result.status === 'failed' ? 'common.failed' : result.status === 'warped' ? 'common.abnormal' : 'common.normal', tone: statusTone }
  }
  if (metric.labelKey === 'metrics.plateTemperature' || metric.labelKey === 'metrics.stripeSegments') {
    return { ...metric, labelKey: 'metrics.stripeSegments', value: String(result.segments.length), unit: undefined, tone: statusTone }
  }
  if (metric.labelKey === 'metrics.offset' || metric.labelKey === 'metrics.gapDistance') {
    return { ...metric, labelKey: 'metrics.gapDistance', value: formatNumber(result.gapPx), unit: 'px', tone: statusTone }
  }
  if (metric.labelKey === 'metrics.integrity' || metric.labelKey === 'metrics.continuity') {
    return { ...metric, labelKey: 'metrics.continuity', value: formatNumber(result.continuity * 100), unit: '%', tone: statusTone }
  }
  if (metric.labelKey === 'metrics.alertLevel') {
    return { ...metric, value: result.status === 'normal' ? 'common.normal' : 'common.red', unit: undefined, tone: statusTone }
  }
  return { ...metric }
}

function makeCase(base: DashboardViewModel): DashboardCase {
  const template = base.cases[0]
  return {
    ...template,
    id: 'MAG-0001',
    levelKey: 'common.red',
    color: 'red',
    typeKey: 'event.magneticPlateWarped',
    stateKey: 'common.processing',
    stateTone: 'processing',
    spot: base.map.currentPoint,
    time: base.timestamp,
    updated: base.timestamp.slice(11),
  }
}

function makeGap(result: MagneticPlateDetectionResult): DetectionGap | undefined {
  if (result.segments.length < 2) return undefined
  const [left, right] = [...result.segments].sort((a, b) => a.x - b.x)
  const leftEnd = left.x + left.width
  const rightStart = right.x
  const x = Math.min(leftEnd, rightStart)
  const centerY = (left.centerY + right.centerY) / 2
  return {
    x,
    y: Math.max(0, centerY - 0.035),
    width: Math.max(0.008, Math.abs(rightStart - leftEnd)),
    height: 0.07,
  }
}

function detailKey(status: MagneticPlateDetectionResult['status']): TranslationKey {
  if (status === 'warped') return 'overlay.magneticPlateWarped'
  if (status === 'failed') return 'overlay.magneticPlateDetectionFailed'
  return 'overlay.magneticPlateNormal'
}

function roll(values: number[], value: number): number[] {
  if (values.length === 0) return [value]
  return [...values.slice(1), value]
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Number(value.toFixed(1)).toString()
}
