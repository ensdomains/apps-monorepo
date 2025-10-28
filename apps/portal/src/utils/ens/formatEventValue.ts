import { format } from 'date-fns'

/**
 * Format an event field value for display
 * Handles special formatting for dates/timestamps
 * @param key - The field name (used to detect date fields)
 * @param value - The raw value to format
 * @returns Formatted string representation of the value
 */
export const formatEventValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined) return '-'

  // Format dates (unix timestamps) - fields containing 'Date' or 'expiry'
  if (key.includes('Date') || key.includes('expiry')) {
    const timestamp =
      typeof value === 'string' ? Number.parseInt(value, 10) : (value as number)
    // Only format if it looks like a unix timestamp (> 1000000000)
    if (timestamp > 1000000000) {
      return format(new Date(timestamp * 1000), 'yyyy/MM/dd HH:mm:ss')
    }
  }

  return String(value)
}
