import type { Timestamp } from './types'

/** bigname's largest page. */
export const MAX_PAGE_SIZE = 200

const DECIMAL_SECONDS = /^(0|[1-9][0-9]*)$/
/** The largest instant a Date can hold, in seconds. */
const MAX_DATE_SECONDS = 8_640_000_000_000n

/** Decimal unix seconds, exact; undefined when missing or malformed. */
export const timestampToBigInt = (
  value: Timestamp | null | undefined,
): bigint | undefined =>
  value != null && DECIMAL_SECONDS.test(value) ? BigInt(value) : undefined

/** Decimal unix seconds as a number; undefined past `Number.MAX_SAFE_INTEGER`. */
export const timestampToSeconds = (
  value: Timestamp | null | undefined,
): number | undefined => {
  const seconds = timestampToBigInt(value)
  return seconds === undefined || seconds > BigInt(Number.MAX_SAFE_INTEGER)
    ? undefined
    : Number(seconds)
}

/** Decimal unix seconds as a Date; undefined past the largest Date. */
export const parseTimestamp = (
  value: Timestamp | null | undefined,
): Date | undefined => {
  const seconds = timestampToBigInt(value)
  return seconds === undefined || seconds > MAX_DATE_SECONDS
    ? undefined
    : new Date(Number(seconds) * 1000)
}

/** Unix seconds, or a Date, as the decimal string bigname accepts; fractions are floored. */
export const secondsToTimestamp = (
  seconds: number | bigint | Date,
): Timestamp =>
  typeof seconds === 'bigint'
    ? seconds.toString()
    : BigInt(
        Math.floor(
          seconds instanceof Date ? seconds.getTime() / 1000 : seconds,
        ),
      ).toString()
