import type { LineProtrusionConfig, WireCalibration } from './types.ts'

export type LineProtrusionSessionStatus =
  | 'idle'
  | 'ready'
  | 'calibrating'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'error'

interface VideoSessionDependencies {
  createObjectUrl(file: Blob): string
  revokeObjectUrl(url: string): void
}

const browserDependencies: VideoSessionDependencies = {
  createObjectUrl: (file) => URL.createObjectURL(file),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
}

export class LineProtrusionVideoSession {
  status: LineProtrusionSessionStatus = 'idle'
  sourceUrl: string | undefined
  calibrations: WireCalibration[] = []
  config: LineProtrusionConfig = { warningDeg: 2, alarmDeg: 5, sensitivity: 1 }
  private readonly dependencies: VideoSessionDependencies

  constructor(dependencies: Partial<VideoSessionDependencies> = {}) {
    this.dependencies = { ...browserDependencies, ...dependencies }
  }

  load(file: Blob): string | undefined {
    this.releaseUrl()
    this.calibrations = []
    if (!file.type.startsWith('video/')) {
      this.status = 'error'
      return undefined
    }
    this.sourceUrl = this.dependencies.createObjectUrl(file)
    this.status = 'ready'
    return this.sourceUrl
  }

  beginCalibration(): boolean {
    if (!this.sourceUrl) return false
    this.status = 'calibrating'
    return true
  }

  setCalibration(calibration: WireCalibration): void {
    this.calibrations = [
      ...this.calibrations.filter((item) => item.wire !== calibration.wire),
      calibration,
    ].sort((a, b) => a.wire - b.wire)
    this.status = 'ready'
  }

  setConfig(config: LineProtrusionConfig): void {
    const warningDeg = Math.max(0, finiteOr(config.warningDeg, 2))
    this.config = {
      warningDeg,
      alarmDeg: Math.max(warningDeg, finiteOr(config.alarmDeg, 5)),
      sensitivity: Math.max(0.1, finiteOr(config.sensitivity, 1)),
    }
  }

  start(): boolean {
    if (!this.sourceUrl || !this.calibrations.some((item) => item.wire === 0) || !this.calibrations.some((item) => item.wire === 1)) return false
    this.status = 'running'
    return true
  }

  pause(): void {
    if (this.status === 'running') this.status = 'paused'
  }

  stop(): void {
    if (this.status !== 'idle') this.status = 'stopped'
  }

  complete(): void {
    if (this.sourceUrl) this.status = 'completed'
  }

  fail(): void {
    this.status = 'error'
  }

  dispose(): void {
    this.releaseUrl()
    this.calibrations = []
    this.status = 'idle'
  }

  private releaseUrl(): void {
    if (!this.sourceUrl) return
    this.dependencies.revokeObjectUrl(this.sourceUrl)
    this.sourceUrl = undefined
  }
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}
