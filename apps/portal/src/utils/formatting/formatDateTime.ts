/**
 * Formats a Date object to a localized date string
 * Format: "Month DD, YYYY" (e.g., "January 15, 2025")
 *
 * @param date - Date to format
 * @returns Formatted date string, or undefined if date is undefined
 *
 * @example
 * formatDateTime(new Date('2025-01-15')) // "January 15, 2025"
 * formatDateTime(undefined) // undefined
 */
export const formatDateTime = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

/**
 * Formats a Date as a short expiry-style date string.
 * Format: "MMM DD, YYYY" (e.g., "Feb 17, 2029")
 *
 * @param date - Date to format
 * @returns Formatted date string
 *
 * @example
 * formatExpiryDate(new Date('2029-02-17')) // "Feb 17, 2029"
 */
export const formatExpiryDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Formats a Date as a short date string with local time.
 * Format: "MMM DD, YYYY, HH:MM AM/PM" (e.g., "Feb 17, 2029, 10:30 AM")
 *
 * @param date - Date to format
 * @returns Formatted date and time string in user's local timezone
 */
export const formatExpiryDateTimeLocal = (date: Date): string => {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
