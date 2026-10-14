import type { Timestamp } from './types'

/** bigname's largest page. */
export const MAX_PAGE_SIZE = 200

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
