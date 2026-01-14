/**
 * Formats a Unix timestamp (in seconds) to a human-readable date/time string
 * Format: YYYY/MM/DD HH:MM:SS
 *
 * @param timestamp - Unix timestamp in seconds (as bigint)
 * @returns Formatted date string in UTC, or null if timestamp is undefined
 *
 * @example
 * formatTimestamp(1609459200n) // "2021/01/01 00:00:00"
 */
export const formatTimestamp = (timestamp?: bigint): string | null => {
  if (!timestamp) return null

  return new Date(Number(timestamp) * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace(/\..+/, '')
    .replace(/-/g, '/')
}
