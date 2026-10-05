import type { Timestamp, WrapperExpiryReason } from './types'

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

/** A served NameWrapper entry expiry: exact seconds, or why there is none. */
export type WrapperExpiry =
  | { readonly expiresAt: bigint; readonly reason?: undefined }
  | { readonly expiresAt: null; readonly reason: WrapperExpiryReason }

/**
 * Read `wrapper_expires_at` and its reason from an `ens_v1` object or
 * `ens_v1_wrapper` restrictions. A finite expiry is exact `bigint` seconds
 * (it can exceed `2^53`); a classified absent expiry is `expiresAt: null`
 * with `no_expiry` or `not_set`. `undefined` when the field is not served
 * (always on `ens_v1` from v0.4.1, and for a name with no current NameWrapper
 * entry) or is malformed, which is not proof the name is unwrapped.
 */
export const readWrapperExpiry = (
  source:
    | {
        readonly wrapper_expires_at?: Timestamp | null
        readonly wrapper_expires_at_reason?: WrapperExpiryReason
      }
    | null
    | undefined,
): WrapperExpiry | undefined => {
  if (source?.wrapper_expires_at === undefined) return undefined
  if (source.wrapper_expires_at === null) {
    const reason = source.wrapper_expires_at_reason
    return reason === undefined ? undefined : { expiresAt: null, reason }
  }
  const expiresAt = timestampToBigInt(source.wrapper_expires_at)
  return expiresAt === undefined ? undefined : { expiresAt }
}
