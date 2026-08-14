import { mockDashboardDataProvider } from '../data/DashboardDataProvider.ts'
import type { DashboardViewModel } from '../modules/types.ts'
import { MagneticPlateDetector } from './detector.ts'
import { mapMagneticPlateResult, neutralMagneticPlateDashboard } from './magneticPlateViewModel.ts'
import type { MagneticPlateDetectionResult, MagneticPlateImageData } from './types.ts'

export interface MagneticPlateDashboardResult {
  viewModel: DashboardViewModel
  detection: MagneticPlateDetectionResult
}
interface MagneticPlateProviderDependencies {
  decode(blob: Blob): Promise<MagneticPlateImageData>
  createSourceUrl(blob: Blob): string | Promise<string>
  revokeSourceUrl(url: string): void
}

const browserDependencies: MagneticPlateProviderDependencies = {
  decode: decodeImageBlob,
  createSourceUrl: (blob) => URL.createObjectURL(blob),
  revokeSourceUrl: (url) => URL.revokeObjectURL(url),
}

export class MagneticPlateDataProvider {
  private readonly detector = new MagneticPlateDetector()
  private readonly dependencies: MagneticPlateProviderDependencies
  private activeObjectUrl: string | null = null
  private requestSequence = 0

  constructor(dependencies: Partial<MagneticPlateProviderDependencies> = {}) {
    this.dependencies = { ...browserDependencies, ...dependencies }
  }

  async getDashboard(): Promise<DashboardViewModel> {
    return neutralMagneticPlateDashboard(await mockDashboardDataProvider.getDashboard('magneticPlate'))
  }

  async inspect(file: Blob): Promise<MagneticPlateDashboardResult> {
    const requestId = ++this.requestSequence
    const base = await this.getDashboard()
    const image = await this.dependencies.decode(file)
    const sourceUrl = await this.createInputUrl(file, requestId)
    const detection = this.detector.detect(image)
    return { viewModel: mapMagneticPlateResult(detection, base, sourceUrl), detection }
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

export const magneticPlateDataProvider = new MagneticPlateDataProvider()

async function decodeImageBlob(blob: Blob): Promise<MagneticPlateImageData> {
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

function readCanvasImage(source: CanvasImageSource, width: number, height: number): MagneticPlateImageData {
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
