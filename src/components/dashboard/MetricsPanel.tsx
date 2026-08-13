import { Activity } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import type { DashboardViewModel, MetricValue } from '../../modules/types'
import { Panel } from './Panel'
import { TrendPanel } from './TrendPanel'

function Metric({ metric }: { metric: MetricValue }) {
  const { t, text } = useI18n()
  return <div className="metric"><span>{t(metric.labelKey)}</span><strong className={metric.tone}>{text(metric.value)}{metric.unit ? <small>{metric.unit}</small> : null}</strong>{metric.detected ? <em>{t('common.detected')}</em> : null}</div>
}

export function MetricsPanel({ viewModel, floorId }: { viewModel: DashboardViewModel; floorId: string }) {
  const { t } = useI18n()
  const metrics = viewModel.metrics.map((metric) => metric.labelKey === 'metrics.floor' ? { ...metric, value: floorId } : metric)
  return <Panel title={t('panels.status')} icon={<Activity size={15} />} className="status-panel">
    <div className="metrics-grid">{metrics.map((metric) => <Metric key={metric.id} metric={metric} />)}</div>
    <div className="subheading">{t(viewModel.trend.titleKey)} · {t('trend.recent')}</div>
    <TrendPanel trend={viewModel.trend} />
    <div className="system-status">{viewModel.systemStatusKeys.map((key) => <span key={key}><i className="status-dot" />{t(key)}</span>)}</div>
  </Panel>
}
