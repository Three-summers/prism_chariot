export const DESIGN_WIDTH = 1600
export const DESIGN_HEIGHT = 900

export function computeUiScale(
  viewportWidth: number,
  viewportHeight: number,
  designWidth = DESIGN_WIDTH,
  designHeight = DESIGN_HEIGHT,
): number {
  if (![viewportWidth, viewportHeight, designWidth, designHeight].every(Number.isFinite)) return 0
  if (viewportWidth <= 0 || viewportHeight <= 0 || designWidth <= 0 || designHeight <= 0) return 0
  return Math.min(viewportWidth / designWidth, viewportHeight / designHeight)
}
