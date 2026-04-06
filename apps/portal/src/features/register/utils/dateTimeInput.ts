/**
 * Utilities for date/time input handling (e.g. time inputs in the premium drawer).
 * Works with Temporal.Instant, routing through ZonedDateTime for local time access.
 */

/** Extract the local HH:mm string from a Temporal.Instant. */
export function instantToTimeValue(instant: Temporal.Instant): string {
  const zdt = instant.toZonedDateTimeISO(Temporal.Now.timeZoneId())
  return `${String(zdt.hour).padStart(2, '0')}:${String(zdt.minute).padStart(2, '0')}`
}

/** Merge a time string (HH:mm) into an instant, preserving its calendar date in local time. */
export function mergeTimeIntoInstant(
  base: Temporal.Instant,
  timeStr: string,
): Temporal.Instant {
  let hour = 0
  let minute = 0

  try {
    const parsed = Temporal.PlainTime.from(timeStr)
    hour = parsed.hour
    minute = parsed.minute
  } catch {
    // Keep defaults for invalid/empty input.
  }

  return base
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .with({
      hour,
      minute,
      second: 0,
      millisecond: 0,
      microsecond: 0,
      nanosecond: 0,
    })
    .toInstant()
}
