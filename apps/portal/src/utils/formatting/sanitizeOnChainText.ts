/**
 * Strips control and format characters out of a raw on-chain string and caps
 * its length, so arbitrary user-authored bytes (text record keys, contenthashes)
 * can be rendered as plain text without letting the author reorder, overflow or
 * break out of the surrounding copy.
 *
 * Combining marks are left alone — legitimate record keys in Arabic, Devanagari
 * and Thai stack them, and the length cap already bounds the damage.
 *
 * @param value - The raw string as it came off-chain
 * @param maxLength - Maximum characters to keep (default: 64)
 * @returns The sanitized string, suffixed with `\u2026` if it was truncated, or an
 *   empty string if nothing printable survived
 *
 * @example
 * sanitizeOnChainText('com.twitter')
 * // "com.twitter"
 */
export const sanitizeOnChainText = (value: string, maxLength = 64): string => {
  // \p{Cc} covers C0/C1 controls, \p{Cf} bidi overrides and zero-width joiners.
  // Line and paragraph separators fall out of the whitespace collapse below.
  const stripped = value
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()

  // Split by code point so truncation can never cut a surrogate pair in half.
  const codePoints = [...stripped]
  if (codePoints.length <= maxLength) return stripped
  return `${codePoints.slice(0, maxLength).join('')}\u2026`
}
