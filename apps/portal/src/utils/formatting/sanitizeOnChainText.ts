/** ZWNJ and ZWJ — the two format characters that carry meaning, not control. */
const JOINERS = '\\u200C\\u200D'

/**
 * Strips control and format characters out of a raw on-chain string and caps
 * its length, so arbitrary user-authored bytes (text record keys, contenthashes)
 * can be rendered as plain text without letting the author reorder, overflow or
 * break out of the surrounding copy.
 *
 * Combining marks are left alone — legitimate record keys in Arabic, Devanagari
 * and Thai stack them, and the length cap already bounds the damage. The two
 * joiners (U+200C ZWNJ, U+200D ZWJ) are kept for the same reason: they hold
 * emoji sequences together and are orthographically required in Persian, Hindi
 * and other scripts, and neither can reorder the text around it. They are still
 * trimmed from the edges, where they only ever render as invisible padding.
 *
 * @param value - The raw string as it came off-chain
 * @param maxLength - Maximum characters to keep (default: 64)
 * @returns The sanitized string, suffixed with `…` if it was truncated, or an
 *   empty string if nothing printable survived
 *
 * @example
 * sanitizeOnChainText('com.twitter')
 * // "com.twitter"
 */
export const sanitizeOnChainText = (value: string, maxLength = 64): string => {
  // \p{Cc} covers C0/C1 controls, \p{Cf} bidi overrides and zero-width spaces.
  // Line and paragraph separators fall out of the whitespace collapse below.
  const stripped = value
    .replace(new RegExp(`(?![${JOINERS}])[\\p{Cc}\\p{Cf}]`, 'gu'), ' ')
    .replace(/\s+/gu, ' ')
    .replace(new RegExp(`^[${JOINERS}\\s]+|[${JOINERS}\\s]+$`, 'gu'), '')

  // Split by code point so truncation can never cut a surrogate pair in half.
  const codePoints = [...stripped]
  if (codePoints.length <= maxLength) return stripped
  return `${codePoints.slice(0, maxLength).join('')}…`
}
