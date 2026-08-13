import { useI18n } from '../../i18n/I18nProvider'
import type { DashboardViewModel } from '../../modules/types'
import { makeTrendPoints } from './trendGeometry'

export function TrendPanel({ trend }: { trend: DashboardViewModel['trend'] }) {
  const { t } = useI18n()
  const allValues = trend.series.flatMap((item) => item.values)
  const minimum = Math.min(...allValues)
  const maximum = Math.max(...allValues)
  const padding = Math.max((maximum - minimum) * 0.12, 1)
  return <div className="trend-wrap">
    <div className="legend">{trend.series.map((item) => <span key={item.id}><i className={`dot ${item.tone}`} />{t(item.labelKey)}</span>)}<span className="axis-note">{trend.unit}</span></div>
    <svg className="trend-chart" viewBox="0 0 520 110" preserveAspectRatio="none" role="img" aria-label={`${t(trend.titleKey)} ${t('trend.recent')}`}>
      <g className="grid">{[18, 42, 66, 90].map((y) => <line key={y} x1="8" x2="512" y1={y} y2={y} />)}</g>
      {trend.series.map((item) => <polyline key={item.id} points={makeTrendPoints(item.values, minimum - padding, maximum + padding, 500, 92)} transform="translate(10 9)" className={`trend-line ${item.tone}`} />)}
    </svg>
    <div className="chart-labels">{trend.labels.map((label) => <span key={label}>{label}</span>)}</div>
  </div>
}
