/**
 * How the name chip lays out on a card.
 *
 * satori measures and wraps the name itself; the widths below only decide the
 * two things it can't: whether the chip hugs its text or spans the card, and
 * where the name gets ellipsised so it can't push past two lines.
 */

/** Card width less its 120px side padding. */
const CONTENT_WIDTH = 960
/** Content width less the chip's 12px side padding. */
const CHIP_INNER_WIDTH = CONTENT_WIDTH - 12 * 2
/** Avatar (80px) plus the 16px gap that follows it. */
const AVATAR_WIDTH = 80 + 16
/**
 * Advance of one Geist Mono glyph at the chip's 60px type size (0.6em = 36px)
 * plus the chip's 0.384px letter-spacing. Geist Mono is true monospace, so
 * this is exact, not an average.
 */
const CHAR_WIDTH = 36 + 0.384
/** The chip never grows past the two lines the design tops out at. */
const MAX_LINES = 2

export type OgChipName = {
  /** Whether the chip spans the card because the name needs more than a line. */
  readonly isWide: boolean
  /** The name as drawn, ellipsised when it wouldn't fit two lines. */
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

export function fitOgChipName(name: string, hasAvatar: boolean): OgChipName {
  const textWidth = hasAvatar
    ? CHIP_INNER_WIDTH - AVATAR_WIDTH
    : CHIP_INNER_WIDTH
  const charsPerLine = Math.floor(textWidth / CHAR_WIDTH)

  if (name.length <= charsPerLine) return { isWide: false, text: name }

  const maxChars = charsPerLine * MAX_LINES

  return {
    isWide: true,
    text: name.length <= maxChars ? name : ellipsise(name, maxChars),
  }
}
