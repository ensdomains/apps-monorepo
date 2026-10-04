import type { Timestamp } from './types'

/**
 * bigname serves every timestamp as a decimal string of Unix seconds
 * (`"1803965433"`). Finite expiries keep every digit, including values beyond
 * `2^53` and `i64::MAX`, so only `timestampToBigInt` is exact for all of them.
 */
const DECIMAL_SECONDS = /^(0|[1-9][0-9]*)$/

/** Largest instant a `Date` can hold, in seconds (±8.64e15 ms). */
const MAX_DATE_SECONDS = 8_640_000_000_000n

/** Decimal-seconds string → exact `bigint`; `undefined` for a missing or malformed value. */
export const timestampToBigInt = (
  value: Timestamp | null | undefined,
): bigint | undefined =>
  value != null && DECIMAL_SECONDS.test(value) ? BigInt(value) : undefined

/**
 * Decimal-seconds string → whole Unix seconds as a `number`. `undefined` for
 * a missing or malformed value, or one above `Number.MAX_SAFE_INTEGER` (use
 * `timestampToBigInt` for those).
 */
export const timestampToSeconds = (
  value: Timestamp | null | undefined,
): number | undefined => {
  const seconds = timestampToBigInt(value)
  if (seconds === undefined || seconds > BigInt(Number.MAX_SAFE_INTEGER)) {
    return undefined
  }
  return Number(seconds)
}

/**
 * Decimal-seconds string → `Date`. `undefined` for a missing or malformed
 * value, or one past the largest `Date` (year 275760).
 */
export const parseTimestamp = (
  value: Timestamp | null | undefined,
): Date | undefined => {
  const seconds = timestampToBigInt(value)
  if (seconds === undefined || seconds > MAX_DATE_SECONDS) return undefined
  return new Date(Number(seconds) * 1000)
}

/**
 * Unix seconds (or a `Date`) → the decimal-seconds string bigname serves and
 * accepts in timestamp query params. Fractional seconds are floored; a
 * non-finite number or invalid `Date` throws `RangeError`.
 */
export const secondsToTimestamp = (
  seconds: number | bigint | Date,
): Timestamp => {
  if (typeof seconds === 'bigint') return seconds.toString()
  const value = seconds instanceof Date ? seconds.getTime() / 1000 : seconds
  return BigInt(Math.floor(value)).toString()
}
