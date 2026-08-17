function formatCoordinate(value: number): string {
  return Number(value.toFixed(2)).toString()
}

export interface TrendScale {
  minimum: number
  maximum: number
  ticks: number[]
}

export interface TrendLabel {
  index: number
  label: string
}

export function makeTrendScale(values: number[], targetTickCount = 4): TrendScale {
  const finiteValues = values.filter(Number.isFinite)
  let minimum = finiteValues.length > 0 ? Math.min(...finiteValues) : 0
  let maximum = finiteValues.length > 0 ? Math.max(...finiteValues) : 1

  if (minimum === maximum) {
    const padding = Math.max(Math.abs(minimum) * 0.1, 1)
    minimum -= padding
    maximum += padding
  }

  const rawStep = (maximum - minimum) / Math.max(1, targetTickCount - 1)
  const step = niceStep(rawStep)
  minimum = roundValue(Math.floor(minimum / step) * step)
  maximum = roundValue(Math.ceil(maximum / step) * step)

  const ticks: number[] = []
  for (let value = minimum; value <= maximum + step / 2; value += step) {
    ticks.push(roundValue(value))
  }
  return { minimum, maximum, ticks }
}

export function formatTrendTime(seconds: number): string {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(1).padStart(4, '0')}`
}

export function formatTrendClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

export function formatTrendValue(value: number): string {
  return Number(value.toFixed(2)).toString()
}

export function pickTrendLabels(labels: string[], maximumCount = 4): TrendLabel[] {
  if (labels.length === 0 || maximumCount <= 0) return []
  if (labels.length <= maximumCount) {
    return labels.map((label, index) => ({ index, label })).filter((item) => item.label.length > 0)
  }

  const selected = new Map<number, TrendLabel>()
  for (let slot = 0; slot < maximumCount; slot += 1) {
    const index = Math.round(slot * (labels.length - 1) / Math.max(1, maximumCount - 1))
    if (labels[index]) selected.set(index, { index, label: labels[index] })
  }
  return [...selected.values()]
}

export function makeTrendPoints(
  values: number[],
  minimum: number,
  maximum: number,
  width: number,
  height: number,
): string {
  if (values.length === 0) return ''

  const range = maximum - minimum
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width
    const y = range === 0 ? height / 2 : height - ((value - minimum) / range) * height
    return `${formatCoordinate(x)},${formatCoordinate(y)}`
  }).join(' ')
}

function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1
  const exponent = Math.floor(Math.log10(rawStep))
  const fraction = rawStep / 10 ** exponent
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * 10 ** exponent
}

function roundValue(value: number): number {
  return Number(value.toFixed(10))
}
