/**
 * Format an event field value for display
 * Handles special formatting for dates/timestamps
 * @param key - The field name (used to detect date fields)
 * @param value - The raw value to format
 * @returns Formatted string representation of the value
 */
export const formatEventValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined) return '-'

  // Check if field name suggests a timestamp (case-insensitive)
  if (/date|expiry/i.test(key)) {
    const timestamp =
      typeof value === 'bigint'
        ? Number(value)
        : typeof value === 'string'
          ? Number.parseInt(value, 10)
          : Number(value)

    // Only format if it looks like a Unix timestamp in seconds
    if (timestamp > 1_000_000_000) {
      const date = new Date(timestamp * 1000)
      const pad = (n: number) => String(n).padStart(2, '0')
      const formatted =
        [
          date.getUTCFullYear(),
          pad(date.getUTCMonth() + 1),
          pad(date.getUTCDate()),
        ].join('/') +
        ' ' +
        [
          pad(date.getUTCHours()),
          pad(date.getUTCMinutes()),
          pad(date.getUTCSeconds()),
        ].join(':')
      return `${formatted} UTC`
    }
  }

  return String(value)
}
