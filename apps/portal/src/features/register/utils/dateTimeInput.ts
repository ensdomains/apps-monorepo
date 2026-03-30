/**
 * Utilities for date/time input handling (e.g. datetime-local, time inputs).
 */

import { Temporal } from '@js-temporal/polyfill'

/** Format a Date to HH:mm for the time input. */
export function dateToTimeValue(date: Date): string {
  const hour = date.getHours()
  const minute = date.getMinutes()
  const raw = `${String(hour).padStart(2, '0')}:${String(minute).padStart(
    2,
    '0',
  )}`

  // Parsing through Temporal ensures we behave like a wall-clock time.
  const parsed = Temporal.PlainTime.from(raw)
  return `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`
}

/** Merge a time string (HH:mm) into a date's date part. */
export function mergeTimeIntoDate(baseDate: Date, timeStr: string): Date {
  let hour = 0
  let minute = 0

  try {
    const parsed = Temporal.PlainTime.from(timeStr)
    hour = parsed.hour
    minute = parsed.minute
  } catch {
    // Keep defaults to match existing behavior for invalid/empty input.
  }

  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hour,
    minute,
    0,
    0,
  )
}
