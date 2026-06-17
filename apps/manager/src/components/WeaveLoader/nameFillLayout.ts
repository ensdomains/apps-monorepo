export type GlyphMetrics = {
  advanceWidth: number
  glyphHeight: number
  lineIndex: number
}

export function charFillFraction(fillPosition: number, index: number): number {
  return Math.max(0, Math.min(1, fillPosition - index))
}

function groupLineIndices(midYs: number[]): number[] {
  if (midYs.length === 0) return []

  const firstMidY = midYs[0]
  if (firstMidY === undefined) return []

  const lineIndices: number[] = [0]
  let lineIndex = 0
  let lineMidY = firstMidY

  for (let index = 1; index < midYs.length; index += 1) {
    const midY = midYs[index]
    const prevMidY = midYs[index - 1]
    if (prevMidY === undefined || midY === undefined) continue

    const threshold = Math.max(1, Math.abs(midY - prevMidY) * 0.35)
    if (Math.abs(midY - lineMidY) > threshold) {
      lineIndex += 1
      lineMidY = midY
    }
    lineIndices.push(lineIndex)
  }

  return lineIndices
}

export function measureGlyphMetrics(
  probe: HTMLElement,
  textNode: Text,
): GlyphMetrics[] {
  const probeBox = probe.getBoundingClientRect()
  const range = document.createRange()
  const positions: {
    x: number
    width: number
    height: number
    midY: number
  }[] = []

  for (let index = 0; index < textNode.length; index += 1) {
    range.setStart(textNode, index)
    range.setEnd(textNode, index + 1)
    const box = range.getBoundingClientRect()
    positions.push({
      x: box.left - probeBox.left,
      width: Math.max(box.width, 0),
      height: Math.max(box.height, 0),
      midY: box.top + box.height / 2,
    })
  }

  if (positions.length === 0) return []

  const lineIndices = groupLineIndices(
    positions.map((position) => position.midY),
  )

  return positions.map((position, index) => {
    const next = positions[index + 1]
    const sameLine =
      next !== undefined && lineIndices[index] === lineIndices[index + 1]
    const advanceWidth = sameLine
      ? Math.max(next.x - position.x, position.width)
      : position.width

    return {
      advanceWidth,
      glyphHeight: position.height,
      lineIndex: lineIndices[index] ?? 0,
    }
  })
}

export function lineCountFromMetrics(metrics: GlyphMetrics[]): number {
  if (metrics.length === 0) return 1
  return Math.max(...metrics.map((metric) => metric.lineIndex)) + 1
}

/** @deprecated Use GlyphMetrics */
export type GlyphAdvance = GlyphMetrics

/** @deprecated Use measureGlyphMetrics */
export const measureGlyphAdvances = measureGlyphMetrics
