import type { BinaryComponent } from './types.ts'

/** Convert packed RGBA pixels to 8-bit luminance. Alpha is intentionally ignored. */
export function grayScale(rgba: ArrayLike<number>, width: number, height: number): Uint8Array {
  const pixelCount = width * height
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0 || rgba.length < pixelCount * 4) {
    throw new RangeError('RGBA buffer does not match the supplied dimensions')
  }
  const gray = new Uint8Array(pixelCount)
  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 4
    gray[i] = Math.round(0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2])
  }
  return gray
}

/** Threshold a grayscale buffer. By default dark pixels become foreground (1). */
export function threshold(gray: ArrayLike<number>, value: number, darkForeground = true): Uint8Array {
  if (!Number.isFinite(value)) throw new RangeError('Threshold must be finite')
  const output = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i += 1) {
    output[i] = darkForeground ? (gray[i] < value ? 1 : 0) : (gray[i] > value ? 1 : 0)
  }
  return output
}

/**
 * Morphological closing (dilation followed by erosion) with a square kernel.
 * `radius=3` matches the reference program's 7x7 kernel. Border samples are
 * clipped to the image, which avoids creating an artificial empty frame.
 */
export function closeBinaryMask(mask: ArrayLike<number>, width: number, height: number, radius = 1): Uint8Array {
  validateMaskDimensions(mask, width, height)
  if (!Number.isInteger(radius) || radius < 0) throw new RangeError('Kernel radius must be a non-negative integer')
  if (radius === 0) return Uint8Array.from(mask, (value) => (value ? 1 : 0))

  const dilated = new Uint8Array(mask.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let found = false
      for (let ky = -radius; ky <= radius && !found; ky += 1) {
        const sy = y + ky
        if (sy < 0 || sy >= height) continue
        for (let kx = -radius; kx <= radius; kx += 1) {
          const sx = x + kx
          if (sx >= 0 && sx < width && mask[sy * width + sx]) {
            found = true
            break
          }
        }
      }
      dilated[y * width + x] = found ? 1 : 0
    }
  }

  const closed = new Uint8Array(mask.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let filled = true
      for (let ky = -radius; ky <= radius && filled; ky += 1) {
        const sy = y + ky
        if (sy < 0 || sy >= height) continue
        for (let kx = -radius; kx <= radius; kx += 1) {
          const sx = x + kx
          if (sx >= 0 && sx < width && !dilated[sy * width + sx]) {
            filled = false
            break
          }
        }
      }
      closed[y * width + x] = filled ? 1 : 0
    }
  }
  return closed
}

/** Return 8-connected foreground components in row-major discovery order. */
export function connectedComponents(mask: ArrayLike<number>, width: number, height: number): BinaryComponent[] {
  validateMaskDimensions(mask, width, height)
  const visited = new Uint8Array(mask.length)
  const components: BinaryComponent[] = []
  const neighbors = [-1, 0, 1]

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x
      if (!mask[start] || visited[start]) continue
      visited[start] = 1
      const queue: number[] = [start]
      let area = 0
      let minX = x
      let maxX = x
      let minY = y
      let maxY = y
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor]
        const currentX = index % width
        const currentY = Math.floor(index / width)
        area += 1
        minX = Math.min(minX, currentX)
        maxX = Math.max(maxX, currentX)
        minY = Math.min(minY, currentY)
        maxY = Math.max(maxY, currentY)
        for (const dy of neighbors) {
          for (const dx of neighbors) {
            if (dx === 0 && dy === 0) continue
            const nextX = currentX + dx
            const nextY = currentY + dy
            if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue
            const next = nextY * width + nextX
            if (mask[next] && !visited[next]) {
              visited[next] = 1
              queue.push(next)
            }
          }
        }
      }
      components.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area })
    }
  }
  return components
}

function validateMaskDimensions(mask: ArrayLike<number>, width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0 || mask.length !== width * height) {
    throw new RangeError('Mask does not match the supplied dimensions')
  }
}
