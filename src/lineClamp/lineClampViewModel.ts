import type {
  DashboardCase,
  DashboardViewModel,
  DetectionBox,
  MetricValue,
  OverlayStat,
} from '../modules/types.ts'
import type { TranslationKey } from '../i18n/resources.ts'
import { formatTrendClock } from '../components/dashboard/trendGeometry.ts'
import type { LineClampDetectionResult } from './types.ts'

/**
 * Map detector output onto the existing line-clamp dashboard contract.
 *
 * The mapper deliberately does not know about React, browser image objects, or
 * providers. A provider can pass an object URL for `sourceUrl`; the shell then
 * renders the same three-column dashboard as every other module.
 */
export function mapLineClampResult(
  result: LineClampDetectionResult,
  baseViewModel: DashboardViewModel,
  sourceUrl?: string,
): DashboardViewModel {
  const detectionBox = normalizeBox(result.box, result.width, result.height)
  const anomaly = !result.success || result.status !== 'ok'
  const alertTone: MetricValue['tone'] = anomaly ? 'danger' : 'success'

  const metrics = baseViewModel.metrics.map((metric) => mapMetric(metric, result, anomaly, alertTone))
  const cases = baseViewModel.cases.map((item, index) => index === 0 ? mapCurrentCase(item, result, anomaly) : { ...item })
  const overlayStats = buildOverlayStats(result)
  const overlay: DashboardViewModel['overlay'] = {
    ...baseViewModel.overlay,
    titleKey: 'overlay.lineClampDetection',
    detailKey: result.success ? keyForDetail(result) : 'overlay.detectionFailed',
    stats: overlayStats,
    ...(detectionBox ? { detectionBox } : { detectionBox: undefined }),
  }

  const trend: DashboardViewModel['trend'] = {
    ...baseViewModel.trend,
    titleKey: 'trend.clampAngle',
    unit: '°',
    labels: baseViewModel.trend.labels.map((_, index, all) => (
      index === all.length - 1 ? formatTrendClock(new Date()) : ''
    )),
    series: baseViewModel.trend.series.map((series, index) => {
      if (index !== 0 || series.values.length === 0) return { ...series, values: [...series.values] }
      const values = [...series.values]
      values[values.length - 1] = result.success ? Math.abs(result.angleDeg) : 0
      return { ...series, values }
    }),
  }

  return {
    ...baseViewModel,
    media: {
      ...baseViewModel.media,
      ...(sourceUrl ? { kind: 'image' as const, src: sourceUrl } : {}),
      ...(result.width > 0 && result.height > 0 ? { sourceWidth: result.width, sourceHeight: result.height } : {}),
      ...(detectionBox ? { detectionBox } : { detectionBox: undefined }),
    },
    metrics,
    trend,
    cases,
    overlay,
  }
}

function mapMetric(
  metric: MetricValue,
  result: LineClampDetectionResult,
  anomaly: boolean,
  alertTone: MetricValue['tone'],
): MetricValue {
  if (metric.labelKey === 'metrics.anomalyCount') {
    return { ...metric, value: anomaly ? '1' : '0', tone: anomaly ? 'danger' : 'success' }
  }
  if (metric.labelKey === 'metrics.alertLevel') {
    return { ...metric, value: anomaly ? 'common.red' : 'common.normal', tone: alertTone }
  }
  // The seventh slot in the shared dashboard is the module's confidence-like
  // value. For line-clamp detection it carries the measured angle instead.
  if (metric.labelKey === 'metrics.confidence') {
    return { ...metric, labelKey: 'metrics.angle', value: formatNumber(result.angleDeg), unit: '°', tone: result.isTilted ? 'warning' : 'normal' }
  }
  return { ...metric }
}

function mapCurrentCase(item: DashboardCase, result: LineClampDetectionResult, anomaly: boolean): DashboardCase {
  const typeKey = result.status === 'ok' ? 'event.detectionNormal'
    : result.status === 'tilted-no-screw' ? 'event.tiltedScrewMissing'
      : result.status === 'tilted' ? 'event.clipTilted'
        : result.status === 'no-screw' ? 'event.screwMissing'
          : 'event.detectionFailed'
  const stateTone: DashboardCase['stateTone'] = anomaly ? 'processing' : 'confirmed'
  return {
    ...item,
    levelKey: anomaly ? 'common.red' : 'common.normal',
    color: anomaly ? 'red' : 'green',
    typeKey,
    stateKey: anomaly ? 'common.processing' : 'common.confirmed',
    stateTone,
  }
}

function buildOverlayStats(result: LineClampDetectionResult): OverlayStat[] {
  const stats: OverlayStat[] = [
    { labelKey: 'overlay.angle', value: formatNumber(result.angleDeg), unit: '°' },
    { labelKey: 'overlay.screw', value: result.hasScrew ? 'common.normal' : 'common.abnormal' },
    { labelKey: 'overlay.screwContrast', value: formatNumber(result.screwContrast) },
  ]
  if (result.box) {
    stats.push({ labelKey: 'overlay.clipArea', value: formatNumber(result.area), unit: 'px²' })
  }
  return stats
}

function normalizeBox(box: LineClampDetectionResult['box'], width: number, height: number): DetectionBox | undefined {
  if (!box || width <= 0 || height <= 0) return undefined
  return { x: box.x / width, y: box.y / height, width: box.width / width, height: box.height / height }
}

function keyForDetail(result: LineClampDetectionResult): TranslationKey {
  if (result.isTilted && !result.hasScrew) return 'overlay.tiltedScrewMissing'
  if (result.isTilted) return 'overlay.tilted'
  if (!result.hasScrew) return 'overlay.screwMissing'
  return 'overlay.detectionNormal'
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Number(value.toFixed(1)).toString()
}
