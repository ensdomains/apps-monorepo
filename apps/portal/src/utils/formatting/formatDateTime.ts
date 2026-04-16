/**
 * Formats a Temporal.PlainDate to a localized date string.
 * Format: "Month DD, YYYY" (e.g., "January 15, 2025")
 *
 * @example
 * formatDateTime(Temporal.PlainDate.from('2025-01-15')) // "January 15, 2025"
 */
export const formatDateTime = (date: Temporal.PlainDate): string =>
  date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

/**
 * Formats a Temporal.PlainDate as a short expiry-style date string.
 * Format: "MMM DD, YYYY" (e.g., "Feb 17, 2029")
 *
 * @example
 * formatExpiryDate(Temporal.PlainDate.from('2029-02-17')) // "Feb 17, 2029"
 */
export const formatExpiryDate = (date: Temporal.PlainDate): string =>
  date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

/**
 * Formats a Temporal.Instant as a short date + local time string.
 * Format: "MMM DD, YYYY, HH:MM AM/PM" (e.g., "Feb 17, 2029, 10:30 AM")
 */
export const formatExpiryDateTimeLocal = (instant: Temporal.Instant): string =>
  new Date(instant.epochMilliseconds).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
