function formatCoordinate(value: number): string {
  return Number(value.toFixed(2)).toString()
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
