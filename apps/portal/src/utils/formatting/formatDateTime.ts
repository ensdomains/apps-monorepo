/**
 * Formats a Date object to a localized date string
 * Format: "Month DD, YYYY" (e.g., "January 15, 2025")
 *
 * @param date - Date to format
 * @returns Formatted date string, or undefined if date is undefined/null
 *
 * @example
 * formatDateTime(new Date('2025-01-15')) // "January 15, 2025"
 */
export const formatDateTime = (date?: Date | null): string | undefined => {
  if (!date) return undefined

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}
