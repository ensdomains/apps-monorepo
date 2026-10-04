import type { Timestamp } from './types'

/**
 * bigname serves RFC 3339 with `Z` or a numeric offset and up to nine
 * fractional digits (the live deployment also emits `+00:00`). `Date` keeps
 * milliseconds, so extra digits are dropped before parsing.
 */
const EXTRA_FRACTION = /(\.\d{3})\d+/

/** RFC 3339 → `Date`; `undefined` for a missing or unparseable value. */
export const parseTimestamp = (
  value: Timestamp | null | undefined,
): Date | undefined => {
  if (!value) return undefined
  const millis = Date.parse(value.replace(EXTRA_FRACTION, '$1'))
  return Number.isNaN(millis) ? undefined : new Date(millis)
}

/** RFC 3339 → whole unix seconds; `undefined` for a missing or unparseable value. */
export const timestampToSeconds = (
  value: Timestamp | null | undefined,
): number | undefined => {
  const date = parseTimestamp(value)
  return date === undefined ? undefined : Math.floor(date.getTime() / 1000)
}

/** Unix seconds → RFC 3339 UTC (`YYYY-MM-DDTHH:MM:SSZ`) for query params. */
export const secondsToTimestamp = (seconds: number | bigint): Timestamp =>
  new Date(Number(seconds) * 1000).toISOString().replace('.000Z', 'Z')
