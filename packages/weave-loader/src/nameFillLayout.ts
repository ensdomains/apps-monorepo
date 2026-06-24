export type GlyphMetrics = {
  advanceWidth: number
  glyphHeight: number
  lineIndex: number
}

/**
 * Split a string into grapheme clusters so emoji, astral characters, and
 * combining marks count as one visual unit. Falls back to code points
 * (`Array.from`) where `Intl.Segmenter` is unavailable. Measurement and
 * rendering MUST use the same segmentation, otherwise glyph counts diverge.
 */
export function segmentGraphemes(value: string): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: 'grapheme',
    })
    return Array.from(segmenter.segment(value), (s) => s.segment)
  }
  return Array.from(value)
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
  segments: string[],
): GlyphMetrics[] {
  const probeBox = probe.getBoundingClientRect()
  const range = document.createRange()
  const positions: {
    x: number
    width: number
    height: number
    midY: number
  }[] = []

  // Walk grapheme clusters, advancing by each cluster's UTF-16 length so the
  // range offsets stay aligned with the text node's code units.
  let offset = 0
  for (const segment of segments) {
    const start = offset
    const end = offset + segment.length
    offset = end
    range.setStart(textNode, start)
    range.setEnd(textNode, end)
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
