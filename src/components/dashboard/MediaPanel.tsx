import { FolderOpen, ImagePlus, Pause, Play, Square } from 'lucide-react'
import { useRef, type CSSProperties } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import type { DashboardViewModel } from '../../modules/types'
import type { BatchControls } from './DashboardShell'
import { DetectionOverlay } from './DetectionOverlay'
import { LineProtrusionMedia, type LineProtrusionControls } from './LineProtrusionMedia'

export interface MagneticPlateControls {
  onImage(file: File): void
}

export function MediaPanel({ viewModel, batchControls, lineProtrusionControls, magneticPlateControls, mediaError = false }: { viewModel: DashboardViewModel; batchControls?: BatchControls; lineProtrusionControls?: LineProtrusionControls; magneticPlateControls?: MagneticPlateControls; mediaError?: boolean }) {
  const { t, text } = useI18n()
  const { media, timestamp, overlay } = viewModel
  const directoryInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)

  if (lineProtrusionControls) return <LineProtrusionMedia viewModel={viewModel} controls={lineProtrusionControls} />

  async function chooseDirectory() {
    if (!batchControls) return
    if (!await batchControls.onPickDirectory()) directoryInput.current?.click()
  }

  return <>
    <div className="live-heading"><span>{t('panels.liveView')}</span><b>|</b><span>{media.deviceId}</span><b>|</b><span className="live-stamp">{timestamp}</span>{batchControls ? <div className="batch-controls">
      <button type="button" onClick={() => void chooseDirectory()} title={t('actions.selectDirectory')}><FolderOpen size={14} /><span>{t('actions.selectDirectory')}</span></button>
      <input ref={directoryInput} className="directory-input" name="lineClampDirectory" type="file" accept="image/*" multiple {...({ webkitdirectory: '' } as object)} onChange={(event) => { if (event.target.files?.length) batchControls.onDirectoryFiles(event.target.files); event.target.value = '' }} />
      <label>{t('batch.interval')}<input name="lineClampInterval" type="number" min="0" max="60" step="0.1" value={batchControls.intervalSeconds} onChange={(event) => batchControls.onIntervalChange(Number(event.target.value))} /></label>
      {batchControls.status === 'paused' ? <button type="button" className="icon-button" onClick={batchControls.onResume} title={t('actions.resume')}><Play size={14} /></button> : <button type="button" className="icon-button" onClick={batchControls.onPause} disabled={batchControls.status !== 'running'} title={t('actions.pause')}><Pause size={14} /></button>}
      <button type="button" className="icon-button" onClick={batchControls.onStop} disabled={!['running', 'paused'].includes(batchControls.status)} title={t('actions.stop')}><Square size={13} /></button>
      <span className="batch-progress">{batchControls.current}/{batchControls.total}</span>
    </div> : magneticPlateControls ? <div className="batch-controls media-picker-controls">
      <button type="button" onClick={() => imageInput.current?.click()} title={t('actions.selectImage')}><ImagePlus size={14} /><span>{t('actions.selectImage')}</span></button>
      <input ref={imageInput} className="directory-input" name="magneticPlateImage" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) magneticPlateControls.onImage(file); event.target.value = '' }} />
    </div> : <span className="live-meta">{media.speed} m/s　↑ {t(media.directionKey)}　{t(media.modeKey)}</span>}<span className="online"><i />{t('status.online')}</span></div>
    <div className="scene">
      {media.kind === 'image' && media.src && media.sourceWidth && media.sourceHeight ? <div className="scene-image-frame" style={{ '--image-ratio': media.sourceWidth / media.sourceHeight } as CSSProperties}><img src={media.src} alt={t(viewModel.moduleId === 'magneticPlate' ? 'media.magneticPlateImage' : 'media.lineClampImage')} /><DetectionOverlay overlay={overlay} /></div> : <><div className="scene-placeholder"><div className="placeholder-grid" /><div className="camera-ring"><span>{t('media.live')}</span></div><strong>{t('media.placeholderTitle')}</strong><small>{t('media.placeholderDescription', { device: media.deviceId, area: media.areaKey ? t(media.areaKey) : text(media.area) })}</small></div><DetectionOverlay overlay={overlay} /></>}
      {mediaError ? <div className="media-error" role="alert"><span>{t(viewModel.moduleId === 'magneticPlate' ? 'status.magneticPlateLoadError' : 'status.lineClampLoadError')}</span></div> : null}
    </div>
  </>
}
