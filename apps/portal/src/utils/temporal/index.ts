/**
 * Returns epoch milliseconds using Temporal when available.
 * Falls back to Date.now while the polyfill is still loading.
 */
export const getNowEpochMilliseconds = (): number =>
  Temporal.Now.instant().epochMilliseconds

/**
 * Converts epoch milliseconds to Date, using Temporal as the source of truth
 * when it is available.
 */
export const dateFromEpochMilliseconds = (epochMilliseconds: number): Date =>
  new Date(
    Temporal.Instant.fromEpochMilliseconds(epochMilliseconds).epochMilliseconds,
  )

/**
 * Converts a Date into epoch milliseconds, preferring Temporal semantics.
 */
export const epochMillisecondsFromDate = (date: Date): number =>
  Temporal.Instant.fromEpochMilliseconds(date.valueOf()).epochMilliseconds
