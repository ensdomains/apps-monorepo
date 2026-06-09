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

/**
 * Formats the time remaining until an expiry date as whole years and the
 * leftover days (months collapsed into days).
 * Format: "1 year 123 days" (e.g., "2 years 5 days", "45 days", "3 years").
 * Returns "Expired" once the date is at or before `today`.
 *
 * `today` is injectable for testing; defaults to the current calendar date.
 */
export const formatExpiryDuration = (
  expiryDate: Temporal.PlainDate,
  today: Temporal.PlainDate = Temporal.Now.plainDateISO(),
): string => {
  if (Temporal.PlainDate.compare(expiryDate, today) <= 0) return 'Expired'

  const { years } = today.until(expiryDate, { largestUnit: 'years' })
  const { days } = today.add({ years }).until(expiryDate, {
    largestUnit: 'days',
  })

  const parts: string[] = []
  if (years > 0) parts.push(years === 1 ? '1 year' : `${years} years`)
  // Keep the day component unless it's a clean number of years (e.g. "3 years").
  if (days > 0 || years === 0) {
    parts.push(days === 1 ? '1 day' : `${days} days`)
  }
  return parts.join(' ')
}
