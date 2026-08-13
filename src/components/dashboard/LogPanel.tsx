import { Clock3 } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import type { LogEntry } from '../../modules/types'
import { Panel } from './Panel'

export function LogPanel({ logs }: { logs: LogEntry[] }) {
  const { t } = useI18n()
  return <Panel title={t('panels.logs')} icon={<Clock3 size={15} />} className="log-panel"><div className="log-list">{logs.map((entry, index) => <div className={`log-row ${entry.tone}`} key={`${entry.time}-${index}`}><i /><time>{entry.time}</time><span>{t(entry.messageKey)}</span></div>)}</div></Panel>
}
