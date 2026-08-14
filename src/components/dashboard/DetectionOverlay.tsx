import { useI18n } from '../../i18n/I18nProvider'
import type { DetectionOverlayModel } from '../../modules/types'

export function DetectionOverlay({ overlay }: { overlay: DetectionOverlayModel }) {
  const { t, text } = useI18n()
  const frameStyle = overlay.detectionBox ? {
    left: `${overlay.detectionBox.x * 100}%`,
    top: `${overlay.detectionBox.y * 100}%`,
    width: `${overlay.detectionBox.width * 100}%`,
    height: `${overlay.detectionBox.height * 100}%`,
    transform: 'none',
  } : undefined
  return (
    <div className={`detection-overlay overlay-${overlay.kind}`}>
      {!overlay.wires?.length ? <div className="detection-frame" style={frameStyle}><i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" /></div> : <svg className="protrusion-wire-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {overlay.wires.map((wire) => <g key={wire.wire} className={`detected-wire state-${wire.state}`}>
          <polyline points={wire.spots.map((spot) => `${spot.x * 100},${spot.y * 100}`).join(' ')} />
          {wire.spots.map((spot, index) => <circle key={index} cx={spot.x * 100} cy={spot.y * 100} r="0.9" />)}
        </g>)}
      </svg>}
      {overlay.wires?.map((wire) => <span key={wire.wire} className={`protrusion-wire-label state-${wire.state}`} style={{ left: `${wire.spots[1].x * 100}%`, top: `${wire.spots[1].y * 100}%` }}>W{wire.wire + 1} {Math.abs(wire.deviationDeg).toFixed(1)}°</span>)}
      <div className="scene-alert">
        <div className="scene-alert-tag"><span>{t(overlay.titleKey)}</span><small>{t(overlay.detailKey)}</small></div>
        <div className="scene-alert-stats">{overlay.stats.map((stat) => <p key={stat.labelKey}><span>{t(stat.labelKey)}</span><strong>{text(stat.value)}</strong>{stat.unit ? <small>{stat.unit}</small> : null}</p>)}</div>
      </div>
    </div>
  )
}
