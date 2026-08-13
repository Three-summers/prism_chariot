import { useI18n } from '../../i18n/I18nProvider'
import type { DetectionOverlayModel } from '../../modules/types'

export function DetectionOverlay({ overlay }: { overlay: DetectionOverlayModel }) {
  const { t } = useI18n()
  return (
    <div className={`detection-overlay overlay-${overlay.kind}`}>
      <div className="detection-frame"><i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" /></div>
      <div className="scene-alert">
        <div className="scene-alert-tag"><span>{t(overlay.titleKey)}</span><small>{t(overlay.detailKey)}</small></div>
        <div className="scene-alert-stats">{overlay.stats.map((stat) => <p key={stat.labelKey}><span>{t(stat.labelKey)}</span><strong>{stat.value}</strong>{stat.unit ? <small>{stat.unit}</small> : null}</p>)}</div>
      </div>
    </div>
  )
}
