export interface DirectoryImage {
  relativePath: string
  file: Blob
}

export type LineClampBatchStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'completed'

interface BatchCallbacks<T> {
  onFrame(item: DirectoryImage, result: T): void
  onProgress(current: number, total: number): void
}

export function naturalSortImages(images: DirectoryImage[]): DirectoryImage[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  return [...images].sort((a, b) => collator.compare(a.relativePath, b.relativePath))
}

export class LineClampBatchController {
  status: LineClampBatchStatus = 'idle'
  intervalMs = 1_000
  private generation = 0
  private resumeWaiters: Array<() => void> = []
  private readonly sleep: (milliseconds: number) => Promise<void>

  constructor(dependencies: { sleep?(milliseconds: number): Promise<void> } = {}) {
    this.sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds)))
  }

  async run<T>(images: DirectoryImage[], process: (item: DirectoryImage) => Promise<T>, callbacks: BatchCallbacks<T>): Promise<void> {
    const generation = ++this.generation
    const queue = naturalSortImages(images)
    this.status = 'running'
    callbacks.onProgress(0, queue.length)
    for (let index = 0; index < queue.length; index += 1) {
      await this.waitUntilRunnable(generation)
      if (!this.isCurrent(generation)) return
      const item = queue[index]
      const result = await process(item)
      if (!this.isCurrent(generation)) return
      callbacks.onFrame(item, result)
      callbacks.onProgress(index + 1, queue.length)
      if (index < queue.length - 1) {
        await this.sleep(Math.max(0, this.intervalMs))
      }
    }
    if (this.isCurrent(generation)) this.status = 'completed'
  }

  pause(): void {
    if (this.status === 'running') this.status = 'paused'
  }

  resume(): void {
    if (this.status !== 'paused') return
    this.status = 'running'
    for (const resolve of this.resumeWaiters.splice(0)) resolve()
  }

  stop(): void {
    if (this.status === 'idle' || this.status === 'completed') return
    this.status = 'stopped'
    this.generation += 1
    for (const resolve of this.resumeWaiters.splice(0)) resolve()
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation && this.status !== 'stopped'
  }

  private async waitUntilRunnable(generation: number): Promise<void> {
    while (this.status === 'paused' && generation === this.generation) {
      await new Promise<void>((resolve) => this.resumeWaiters.push(resolve))
    }
  }
}
