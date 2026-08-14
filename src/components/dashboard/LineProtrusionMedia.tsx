import { Crosshair, FileVideo, Pause, Play, Square } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { detectLineProtrusion, findSpotsOnLine } from '../../lineProtrusion/detector'
import { LineProtrusionVideoSession, type LineProtrusionSessionStatus } from '../../lineProtrusion/videoSession'
import type { LineProtrusionConfig, LineProtrusionDetectionResult, ProtrusionPoint, WireCalibration, WireIndex } from '../../lineProtrusion/types'
import type { DashboardViewModel } from '../../modules/types'
import { DetectionOverlay } from './DetectionOverlay'

export interface LineProtrusionControls {
  onDetection(result: LineProtrusionDetectionResult, config: LineProtrusionConfig, sourceUrl: string, playbackSeconds: number): void
  onReset(): void
}

interface DragLine {
  startX: number
  endX: number
  y: number
}

type VideoFrameElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

export function LineProtrusionMedia({ viewModel, controls }: { viewModel: DashboardViewModel; controls: LineProtrusionControls }) {
  const { t, text } = useI18n()
  const session = useRef(new LineProtrusionVideoSession())
  const controlsRef = useRef(controls)
  const videoRef = useRef<VideoFrameElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const frameRequest = useRef<{ kind: 'video' | 'animation'; id: number } | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string>()
  const [videoRatio, setVideoRatio] = useState(16 / 9)
  const [status, setStatus] = useState<LineProtrusionSessionStatus>('idle')
  const [config, setConfig] = useState<LineProtrusionConfig>({ ...session.current.config })
  const [calibrations, setCalibrations] = useState<WireCalibration[]>([])
  const [activeWire, setActiveWire] = useState<WireIndex>()
  const [dragLine, setDragLine] = useState<DragLine>()
  const [errorKey, setErrorKey] = useState<'status.invalidVideo' | 'status.videoLoadError' | 'status.calibrationRequired' | 'status.calibrationFailed' | 'status.trackingFailed'>()

  controlsRef.current = controls

  useEffect(() => () => {
    cancelFrameRequest()
    videoRef.current?.pause()
    session.current.dispose()
  }, [])

  function loadVideo(file: File): void {
    cancelFrameRequest()
    videoRef.current?.pause()
    const url = session.current.load(file)
    controlsRef.current.onReset()
    setCalibrations([])
    setActiveWire(undefined)
    setDragLine(undefined)
    if (!url) {
      setSourceUrl(undefined)
      setStatus('error')
      setErrorKey('status.invalidVideo')
      return
    }
    setSourceUrl(url)
    setStatus(session.current.status)
    setErrorKey(undefined)
  }

  function beginCalibration(wire: WireIndex): void {
    const video = videoRef.current
    if (!video || !sourceUrl || video.videoWidth <= 0) {
      setErrorKey('status.videoLoadError')
      return
    }
    cancelFrameRequest()
    video.pause()
    if (!session.current.beginCalibration()) return
    setStatus(session.current.status)
    setActiveWire(wire)
    setDragLine(undefined)
    setErrorKey(undefined)
  }

  function pointerPosition(event: PointerEvent<HTMLDivElement>): ProtrusionPoint {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
      y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (activeWire === undefined) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointerPosition(event)
    setDragLine({ startX: point.x, endX: point.x, y: point.y })
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (activeWire === undefined || !dragLine) return
    const point = pointerPosition(event)
    setDragLine({ ...dragLine, endX: point.x })
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>): void {
    if (activeWire === undefined || !dragLine) return
    const point = pointerPosition(event)
    const completed = { ...dragLine, endX: point.x }
    const frame = captureFrame()
    const video = videoRef.current
    if (!frame || !video || Math.abs(completed.endX - completed.startX) * video.videoWidth < 20) {
      setErrorKey('status.calibrationFailed')
      setDragLine(undefined)
      return
    }
    const spots = findSpotsOnLine(
      frame,
      completed.y * video.videoHeight,
      completed.startX * video.videoWidth,
      completed.endX * video.videoWidth,
    )
    if (!spots) {
      setErrorKey('status.calibrationFailed')
      setDragLine(undefined)
      return
    }
    const calibration: WireCalibration = {
      wire: activeWire,
      spots: spots.map((spot) => ({ x: spot.x / video.videoWidth, y: spot.y / video.videoHeight })) as WireCalibration['spots'],
    }
    session.current.setCalibration(calibration)
    controlsRef.current.onReset()
    setCalibrations(session.current.calibrations.map(cloneCalibration))
    setStatus(session.current.status)
    setActiveWire(undefined)
    setDragLine(undefined)
    setErrorKey(undefined)
  }

  async function start(): Promise<void> {
    const video = videoRef.current
    if (!video || !session.current.start()) {
      setErrorKey('status.calibrationRequired')
      return
    }
    if (video.ended) video.currentTime = 0
    setStatus(session.current.status)
    setErrorKey(undefined)
    try {
      await video.play()
      processCurrentFrame()
      scheduleFrame()
    } catch {
      session.current.fail()
      setStatus(session.current.status)
      setErrorKey('status.videoLoadError')
    }
  }

  function pause(): void {
    session.current.pause()
    videoRef.current?.pause()
    cancelFrameRequest()
    setStatus(session.current.status)
  }

  function stop(): void {
    session.current.stop()
    videoRef.current?.pause()
    cancelFrameRequest()
    setStatus(session.current.status)
  }

  function complete(): void {
    processCurrentFrame()
    cancelFrameRequest()
    session.current.complete()
    setStatus(session.current.status)
  }

  function processCurrentFrame(): void {
    const frame = captureFrame()
    const video = videoRef.current
    if (!frame || !sourceUrl || !video) return
    const result = detectLineProtrusion(frame, session.current.calibrations, session.current.config)
    controlsRef.current.onDetection(result, { ...session.current.config }, sourceUrl, video.currentTime)
    setErrorKey(result.state === 'failed' ? 'status.trackingFailed' : undefined)
  }

  function captureFrame(): ImageData | null {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) return null
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    return context.getImageData(0, 0, canvas.width, canvas.height)
  }

  function scheduleFrame(): void {
    cancelFrameRequest()
    const video = videoRef.current
    if (!video || session.current.status !== 'running') return
    if (video.requestVideoFrameCallback) {
      const id = video.requestVideoFrameCallback(() => {
        frameRequest.current = null
        if (session.current.status !== 'running') return
        processCurrentFrame()
        scheduleFrame()
      })
      frameRequest.current = { kind: 'video', id }
      return
    }
    const id = window.requestAnimationFrame(() => {
      frameRequest.current = null
      if (session.current.status !== 'running') return
      processCurrentFrame()
      scheduleFrame()
    })
    frameRequest.current = { kind: 'animation', id }
  }

  function cancelFrameRequest(): void {
    const pending = frameRequest.current
    const video = videoRef.current
    if (!pending) return
    if (pending.kind === 'video') video?.cancelVideoFrameCallback?.(pending.id)
    else window.cancelAnimationFrame(pending.id)
    frameRequest.current = null
  }

  function updateConfig(key: keyof LineProtrusionConfig, value: number): void {
    session.current.setConfig({ ...session.current.config, [key]: value })
    setConfig({ ...session.current.config })
  }

  const running = status === 'running'
  const hasVideo = Boolean(sourceUrl)
  return <>
    <div className="live-heading"><span>{t('panels.liveView')}</span><b>|</b><span>{viewModel.media.deviceId}</span><b>|</b><span className="live-stamp">{viewModel.timestamp}</span><div className="protrusion-controls">
      <button type="button" onClick={() => fileInputRef.current?.click()} title={t('actions.selectVideo')}><FileVideo size={14} /><span>{t('actions.selectVideo')}</span></button>
      <input ref={fileInputRef} className="directory-input" name="lineProtrusionVideo" type="file" accept="video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) loadVideo(file); event.target.value = '' }} />
      <button type="button" className={activeWire === 0 ? 'active' : ''} disabled={!hasVideo} onClick={() => beginCalibration(0)} title={t('actions.calibrateWire1')}><Crosshair size={13} /><span>W1{calibrations.some((item) => item.wire === 0) ? ' ✓' : ''}</span></button>
      <button type="button" className={activeWire === 1 ? 'active' : ''} disabled={!hasVideo} onClick={() => beginCalibration(1)} title={t('actions.calibrateWire2')}><Crosshair size={13} /><span>W2{calibrations.some((item) => item.wire === 1) ? ' ✓' : ''}</span></button>
      <label title={t('protrusion.warningThreshold')}>W<input name="protrusionWarning" type="number" min="0" max="50" step="0.5" value={config.warningDeg} onChange={(event) => updateConfig('warningDeg', Number(event.target.value))} /></label>
      <label title={t('protrusion.alarmThreshold')}>A<input name="protrusionAlarm" type="number" min="0" max="50" step="0.5" value={config.alarmDeg} onChange={(event) => updateConfig('alarmDeg', Number(event.target.value))} /></label>
      <label title={t('protrusion.sensitivity')}>×<input name="protrusionSensitivity" type="number" min="0.1" max="30" step="0.1" value={config.sensitivity} onChange={(event) => updateConfig('sensitivity', Number(event.target.value))} /></label>
      <button type="button" className="icon-button" disabled={!hasVideo} onClick={running ? pause : () => void start()} title={running ? t('actions.pause') : t('actions.resume')}>{running ? <Pause size={14} /> : <Play size={14} />}</button>
      <button type="button" className="icon-button" disabled={!hasVideo} onClick={stop} title={t('actions.stop')}><Square size={13} /></button>
    </div><span className="online"><i />{t('status.online')}</span></div>
    <div className="scene">
      {sourceUrl ? <div
        className={`scene-image-frame scene-video-frame${activeWire !== undefined ? ' calibrating' : ''}`}
        style={{ '--image-ratio': videoRatio } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <video ref={videoRef} src={sourceUrl} playsInline preload="metadata" aria-label={t('media.lineProtrusionVideo')} onLoadedMetadata={(event) => { const video = event.currentTarget; setVideoRatio(video.videoWidth / video.videoHeight); setStatus(session.current.status) }} onEnded={complete} onError={() => { session.current.fail(); setStatus('error'); setErrorKey('status.videoLoadError') }} />
        <canvas ref={canvasRef} hidden />
        <DetectionOverlay overlay={viewModel.overlay} />
        <CalibrationOverlay calibrations={calibrations} dragLine={dragLine} />
      </div> : <div className="scene-placeholder"><div className="placeholder-grid" /><div className="camera-ring"><span>{t('media.live')}</span></div><strong>{t('media.placeholderTitle')}</strong><small>{t('media.placeholderDescription', { device: viewModel.media.deviceId, area: viewModel.media.areaKey ? t(viewModel.media.areaKey) : text(viewModel.media.area) })}</small></div>}
      {errorKey ? <div className="media-error" role="alert"><span>{t(errorKey)}</span></div> : null}
    </div>
  </>
}

function CalibrationOverlay({ calibrations, dragLine }: { calibrations: WireCalibration[]; dragLine?: DragLine }) {
  return <svg className="protrusion-calibration-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    {calibrations.map((calibration) => <g key={calibration.wire} className={`calibration-wire wire-${calibration.wire + 1}`}>
      <polyline points={calibration.spots.map((spot) => `${spot.x * 100},${spot.y * 100}`).join(' ')} />
      {calibration.spots.map((spot, index) => <circle key={index} cx={spot.x * 100} cy={spot.y * 100} r="0.75" />)}
    </g>)}
    {dragLine ? <line className="calibration-drag" x1={dragLine.startX * 100} x2={dragLine.endX * 100} y1={dragLine.y * 100} y2={dragLine.y * 100} /> : null}
  </svg>
}

function cloneCalibration(calibration: WireCalibration): WireCalibration {
  return { ...calibration, spots: calibration.spots.map((spot) => ({ ...spot })) as WireCalibration['spots'] }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
