import { FileText } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import type { DashboardCase } from '../../modules/types'
import { Panel } from './Panel'

export function CaseTable({ cases, selectedId, onSelect }: { cases: DashboardCase[]; selectedId: string; onSelect(item: DashboardCase): void }) {
  const { t } = useI18n()
  return <Panel title={t('panels.caseRecords')} icon={<FileText size={15} />} className="case-panel">
    <div className="case-table">
      <div className="case-head"><span>{t('table.number')}</span><span>{t('table.level')}</span><span>{t('table.time')}</span><span>{t('table.point')}</span><span>{t('table.eventType')}</span><span>{t('table.state')}</span><span>{t('table.owner')}</span><span>{t('table.updated')}</span></div>
      {cases.map((item) => <button className={`case-row ${selectedId === item.id ? 'selected' : ''}`} key={item.id} onClick={() => onSelect(item)}><span>{item.id}</span><span><i className={`level-dot ${item.color}`} />{t(item.levelKey)}</span><span>{item.time}</span><span>{item.spot}</span><span>{t(item.typeKey)}</span><span className={item.stateTone}>{t(item.stateKey)}</span><span>{item.owner}</span><span>{item.updated}</span></button>)}
    </div><div className="table-foot">{t('table.recordCount', { count: cases.length })}<span>‹　1 / 1　›</span></div>
  </Panel>
}
