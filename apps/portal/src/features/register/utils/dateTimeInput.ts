/**
 * Utilities for date/time input handling (e.g. datetime-local, time inputs).
 */

/** Format a Date to HH:mm for the time input. */
export function dateToTimeValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Merge a time string (HH:mm) into a date's date part. */
export function mergeTimeIntoDate(baseDate: Date, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number)
  const result = new Date(baseDate)
  const hour = typeof h === 'number' && !Number.isNaN(h) ? h : 0
  const minute = typeof m === 'number' && !Number.isNaN(m) ? m : 0
  result.setHours(hour, minute, 0, 0)
  return result
}
