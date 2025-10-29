/**
 * Format an event field value for display
 * Handles special formatting for dates/timestamps
 * @param key - The field name (used to detect date fields)
 * @param value - The raw value to format
 * @returns Formatted string representation of the value
 */
export const formatEventValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined) return '-'

  // Detect likely timestamp fields
  if (/date|expiry/i.test(key)) {
    const timestamp =
      typeof value === 'bigint'
        ? Number(value)
        : typeof value === 'string'
          ? Number.parseInt(value, 10)
          : Number(value)

    // Only format if it looks like a Unix timestamp (in seconds)
    if (timestamp > 1_000_000_000) {
      const date = new Date(timestamp * 1000)
      const datePart = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'UTC',
      })
        .format(date)
        .replace(/-/g, '/')

      const timePart = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'UTC',
      })
        .format(date)
        .replace(',', '') // remove potential comma from some locales

      return `${datePart} ${timePart} UTC`
    }
  }

  return String(value)
}
