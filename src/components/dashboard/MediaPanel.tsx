import { useI18n } from '../../i18n/I18nProvider'
import type { DashboardViewModel } from '../../modules/types'
import { DetectionOverlay } from './DetectionOverlay'

export function MediaPanel({ viewModel }: { viewModel: DashboardViewModel }) {
  const { t, text } = useI18n()
  const { media, timestamp, overlay } = viewModel
  return <>
    <div className="live-heading"><span>{t('panels.liveView')}</span><b>|</b><span>{media.deviceId}</span><b>|</b><span className="live-stamp">{timestamp}</span><span className="live-meta">{media.speed} m/s　↑ {t(media.directionKey)}　{t(media.modeKey)}</span><span className="online"><i />{t('status.online')}</span></div>
    <div className="scene">
      <div className="scene-placeholder"><div className="placeholder-grid" /><div className="camera-ring"><span>{t('media.live')}</span></div><strong>{t('media.placeholderTitle')}</strong><small>{t('media.placeholderDescription', { device: media.deviceId, area: media.areaKey ? t(media.areaKey) : text(media.area) })}</small></div>
      <DetectionOverlay overlay={overlay} />
    </div>
  </>
}
