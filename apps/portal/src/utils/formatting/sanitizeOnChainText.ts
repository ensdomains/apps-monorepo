/**
 * Strips control, format and separator characters out of a raw on-chain string
 * and caps its length, so arbitrary user-authored bytes (text record keys,
 * contenthashes, ABI strings) can be rendered as plain text without letting the
 * author reorder, overflow or break out of the surrounding copy.
 *
 * Removed: `\p{Cc}` (C0/C1 controls, newlines, tabs), `\p{Cf}` (bidi overrides
 * and isolates, zero-width joiners, BOM) and `\p{Zl}`/`\p{Zp}` (line and
 * paragraph separators). Remaining whitespace runs collapse to a single space.
 *
 * Combining marks are deliberately left alone — legitimate record keys in
 * Arabic, Devanagari and Thai stack them, and the length cap plus the CSS
 * clipping on the badges that render these values already bound the damage.
 *
 * @param value - The raw string as it came off-chain
 * @param maxLength - Maximum characters to keep (default: 64)
 * @returns The sanitized string, suffixed with `…` if it was truncated, or an
 *   empty string if nothing printable survived
 *
 * @example
 * sanitizeOnChainText('com.twitter')
 * // "com.twitter"
 *
 * // a key holding a newline and a U+202E right-to-left override
 * sanitizeOnChainText(maliciousKey)
 * // "ENS is migrating visit evil.example"
 */
export const sanitizeOnChainText = (value: string, maxLength = 64): string => {
  const stripped = value
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()

  // Split by code point so truncation can never cut a surrogate pair in half.
  const codePoints = [...stripped]
  if (codePoints.length <= maxLength) return stripped
  return `${codePoints.slice(0, maxLength).join('')}…`
}
