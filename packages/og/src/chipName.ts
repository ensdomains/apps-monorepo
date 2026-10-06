/**
 * How the name chip lays out on a card.
 *
 * satori measures and wraps the name itself; the widths below only decide the
 * two things it can't: whether the chip hugs its text or spans the card, and
 * where the name gets ellipsised so it can't push past the design's line cap.
 */

export type OgChipMetrics = {
  /**
   * Advance of one glyph at the chip's type size, letter-spacing included.
   * The cards set names in Geist Mono, which is true monospace (0.6em per
   * glyph), so this is exact rather than an average.
   */
  readonly charWidth: number
  /** Lines the name may wrap to before it is ellipsised. */
  readonly maxLines: number
  /** Width the name has on one line when the chip carries no avatar. */
  readonly textWidth: number
  /** Width the name has on one line beside an avatar. */
  readonly textWidthWithAvatar: number
}

/** Card width less its 120px side padding. */
const CONTENT_WIDTH = 960
/** Content width less the chip's 12px side padding. */
const CHIP_INNER_WIDTH = CONTENT_WIDTH - 12 * 2

/**
 * The explorer's chip: 60px type, an 80px avatar plus a 16px gap, and never
 * more than two lines.
 */
export const DEFAULT_OG_CHIP_METRICS: OgChipMetrics = {
  charWidth: 36 + 0.384,
  maxLines: 2,
  textWidth: CHIP_INNER_WIDTH,
  textWidthWithAvatar: CHIP_INNER_WIDTH - (80 + 16),
}

export type OgChipName = {
  /** Whether the chip spans the card because the name needs more than a line. */
  readonly isWide: boolean
  /** The name as drawn, ellipsised when it wouldn't fit the line cap. */
  readonly text: string
}

/**
 * Ellipsise a name to `maxChars`, keeping its TLD.
 *
 * The dot is dropped along with the truncated tail — `verylongname…eth` — so
 * the surviving TLD reads as a suffix rather than as part of the label.
 */
function ellipsise(name: string, maxChars: number): string {
  const separator = name.lastIndexOf('.')
  const label = separator === -1 ? name : name.slice(0, separator)
  const tld = separator === -1 ? '' : name.slice(separator + 1)
  const head = label.slice(0, Math.max(1, maxChars - tld.length - 1))

  return `${head}…${tld}`
}

export function fitOgChipName(
  name: string,
  hasAvatar: boolean,
  metrics: OgChipMetrics = DEFAULT_OG_CHIP_METRICS,
): OgChipName {
  const textWidth = hasAvatar ? metrics.textWidthWithAvatar : metrics.textWidth
  const charsPerLine = Math.floor(textWidth / metrics.charWidth)

  if (name.length <= charsPerLine) return { isWide: false, text: name }

  const maxChars = charsPerLine * metrics.maxLines

  return {
    isWide: true,
    text: name.length <= maxChars ? name : ellipsise(name, maxChars),
  }
}
