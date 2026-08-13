import type { DirectoryImage } from './directoryBatch.ts'

interface BrowserFileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
}

interface BrowserDirectoryHandle {
  kind: 'directory'
  name: string
  values(): AsyncIterable<BrowserFileHandle | BrowserDirectoryHandle>
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<BrowserDirectoryHandle>
}

const imageExtensions = /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i

export async function pickImageDirectory(): Promise<DirectoryImage[] | undefined> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker
  if (!picker) return undefined
  const root = await picker.call(window)
  return collectDirectoryImages(root)
}

export function imagesFromFileList(files: FileList | File[]): DirectoryImage[] {
  return [...files]
    .filter((file) => file.type.startsWith('image/') || imageExtensions.test(file.name))
    .map((file) => ({ file, relativePath: file.webkitRelativePath || file.name }))
}

async function collectDirectoryImages(directory: BrowserDirectoryHandle, prefix = ''): Promise<DirectoryImage[]> {
  const images: DirectoryImage[] = []
  for await (const entry of directory.values()) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.kind === 'directory') {
      images.push(...await collectDirectoryImages(entry, relativePath))
    } else if (imageExtensions.test(entry.name)) {
      images.push({ file: await entry.getFile(), relativePath })
    }
  }
  return images
}
