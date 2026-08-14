import { useI18n } from '../../i18n/I18nProvider'
import type { DashboardViewModel } from '../../modules/types'
import { formatTrendValue, makeTrendPoints, makeTrendScale, pickTrendLabels } from './trendGeometry'

const chartHeight = 92
const chartPadding = 6
const plotHeight = chartHeight - chartPadding * 2

export function TrendPanel({ trend }: { trend: DashboardViewModel['trend'] }) {
  const { t } = useI18n()
  const allValues = trend.series.flatMap((item) => item.values)
  const scale = makeTrendScale(allValues)
  const labels = pickTrendLabels(trend.labels)
  const range = scale.maximum - scale.minimum
  return <div className="trend-wrap">
    <div className="legend">{trend.series.map((item) => <span key={item.id}><i className={`dot ${item.tone}`} />{t(item.labelKey)}</span>)}<span className="axis-note">{trend.unit}</span></div>
    <div className="trend-body">
      <div className="y-axis" aria-hidden="true">{[...scale.ticks].reverse().map((tick) => {
        const y = chartPadding + (scale.maximum - tick) / range * plotHeight
        return <span key={tick} style={{ top: `${y / chartHeight * 100}%` }}>{formatTrendValue(tick)}</span>
      })}</div>
      <div className="trend-plot">
        <svg className="trend-chart" viewBox="0 0 500 92" preserveAspectRatio="none" role="img" aria-label={`${t(trend.titleKey)} ${t('trend.recent')}`}>
          <g className="grid">{scale.ticks.map((tick) => {
            const y = chartPadding + (scale.maximum - tick) / range * plotHeight
            return <line key={tick} x1="0" x2="500" y1={y} y2={y} />
          })}</g>
          {trend.series.map((item) => <polyline key={item.id} points={makeTrendPoints(item.values, scale.minimum, scale.maximum, 500, plotHeight)} transform={`translate(0 ${chartPadding})`} className={`trend-line ${item.tone}`} />)}
        </svg>
        <div className="chart-labels">{labels.map(({ index, label }) => {
          const position = trend.labels.length <= 1 ? 50 : index / (trend.labels.length - 1) * 100
          const edgeClass = index === 0 ? 'edge-start' : index === trend.labels.length - 1 ? 'edge-end' : ''
          return <span key={`${index}-${label}`} className={edgeClass} style={{ left: `${position}%` }}>{label}</span>
        })}</div>
      </div>
    </div>
  </div>
}
