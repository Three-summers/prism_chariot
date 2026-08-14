import rawCalibrationData from '../../docs/reference_program/线夹识别/calibration.json' with { type: 'json' }
import { DEFAULT_MEDIA } from '../config/defaultMedia.ts'
import { mockDashboardDataProvider } from '../data/DashboardDataProvider.ts'
import type { DashboardViewModel } from '../modules/types.ts'
import { LineClampDetector } from './detector.ts'
import { basename, parseCalibrationData } from './calibration.ts'
import { mapLineClampResult } from './lineClampViewModel.ts'
import type { LineClampDetectionResult, LineClampImageData } from './types.ts'

export const LINE_CLAMP_SAMPLE_URL = DEFAULT_MEDIA.lineClamp.src
export const LINE_CLAMP_SAMPLE_FILENAME = DEFAULT_MEDIA.lineClamp.filename

const calibrations = parseCalibrationData(rawCalibrationData)

export interface LineClampInput {
  file: Blob
  filename: string
}

export interface LineClampDashboardResult {
  viewModel: DashboardViewModel
  detection: LineClampDetectionResult
}

interface LineClampProviderDependencies {
  decode(blob: Blob): Promise<LineClampImageData>
  createSourceUrl(blob: Blob): string | Promise<string>
  revokeSourceUrl(url: string): void
  loadSample(sourceUrl: string): Promise<Blob>
}

const browserDependencies: LineClampProviderDependencies = {
  decode: decodeImageBlob,
  createSourceUrl: (blob) => URL.createObjectURL(blob),
  revokeSourceUrl: (url) => URL.revokeObjectURL(url),
  async loadSample(sourceUrl) {
    const response = await fetch(sourceUrl)
    if (!response.ok) throw new Error(`Unable to load line-clamp sample (${response.status})`)
    return response.blob()
  },
}

export class LineClampDataProvider {
  private readonly detector = new LineClampDetector()
  private readonly dependencies: LineClampProviderDependencies
  private activeObjectUrl: string | null = null
  private requestSequence = 0

  constructor(dependencies: Partial<LineClampProviderDependencies> = {}) {
    this.dependencies = { ...browserDependencies, ...dependencies }
  }

  async getDashboard(input?: LineClampInput): Promise<DashboardViewModel> {
    return (await this.inspect(input)).viewModel
  }

  async inspect(input?: LineClampInput): Promise<LineClampDashboardResult> {
    const requestId = ++this.requestSequence
    const base = await mockDashboardDataProvider.getDashboard('lineClamp')
    const blob = input?.file ?? await this.dependencies.loadSample(LINE_CLAMP_SAMPLE_URL)
    const filename = input?.filename || LINE_CLAMP_SAMPLE_FILENAME
    const image = await this.dependencies.decode(blob)
    const sourceUrl = input ? await this.createInputUrl(blob, requestId) : LINE_CLAMP_SAMPLE_URL
    const calibration = calibrations.get(basename(filename))
    const detection = this.detector.detect({ image, filename, calibration })
    return { viewModel: mapLineClampResult(detection, base, sourceUrl), detection }
  }

  dispose(): void {
    this.requestSequence += 1
    if (!this.activeObjectUrl) return
    this.dependencies.revokeSourceUrl(this.activeObjectUrl)
    this.activeObjectUrl = null
  }

  private async createInputUrl(blob: Blob, requestId: number): Promise<string | undefined> {
    const sourceUrl = await this.dependencies.createSourceUrl(blob)
    if (requestId !== this.requestSequence) {
      this.dependencies.revokeSourceUrl(sourceUrl)
      return undefined
    }
    if (this.activeObjectUrl) this.dependencies.revokeSourceUrl(this.activeObjectUrl)
    this.activeObjectUrl = sourceUrl
    return sourceUrl
  }
}

export const lineClampDataProvider = new LineClampDataProvider()

async function decodeImageBlob(blob: Blob): Promise<LineClampImageData> {
  try {
    const bitmap = await createImageBitmap(blob)
    try {
      return readCanvasImage(bitmap, bitmap.width, bitmap.height)
    } finally {
      bitmap.close()
    }
  } catch {
    const temporaryUrl = URL.createObjectURL(blob)
    try {
      const image = new Image()
      image.src = temporaryUrl
      await image.decode()
      return readCanvasImage(image, image.naturalWidth, image.naturalHeight)
    } finally {
      URL.revokeObjectURL(temporaryUrl)
    }
  }
}

function readCanvasImage(source: CanvasImageSource, width: number, height: number): LineClampImageData {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas 2D context is unavailable')
    context.drawImage(source, 0, 0)
    return context.getImageData(0, 0, width, height)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas 2D context is unavailable')
  context.drawImage(source, 0, 0)
  return context.getImageData(0, 0, width, height)
}
