import {
  SECONDS_PER_DAY,
  V1_GRACE_PERIOD_DAYS,
  V2_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import {
  type Address,
  type Hex,
  isAddress,
  isHex,
  zeroAddress,
  zeroHash,
} from 'viem'

const MS_PER_SECOND = 1000
// The largest instant a JavaScript Date can hold.
const MAX_DATE_SECONDS = 8.64e12

/** Unix seconds as a Date; null for none, zero, or past what a Date holds. */
export const secondsToDate = (
  seconds: number | bigint | string | null | undefined,
): Date | null => {
  if (seconds === null || seconds === undefined) return null
  const value = Number(seconds)
  return Number.isFinite(value) && value > 0 && value <= MAX_DATE_SECONDS
    ? new Date(value * MS_PER_SECOND)
    : null
}

export const secondsToBigint = (
  seconds: number | string | null | undefined,
): bigint | null =>
  seconds === null ||
  seconds === undefined ||
  seconds === '' ||
  seconds === 0 ||
  seconds === '0'
    ? null
    : BigInt(seconds)

/** A lower-cased address; null for none or the zero address. */
export const toAccount = (value: string | null | undefined): Address | null => {
  const lower = value?.toLowerCase()
  return lower && isAddress(lower, { strict: false }) && lower !== zeroAddress
    ? lower
    : null
}

export const V1_GRACE_MS =
  V1_GRACE_PERIOD_DAYS * SECONDS_PER_DAY * MS_PER_SECOND
export const V2_GRACE_MS =
  V2_GRACE_PERIOD_DAYS * SECONDS_PER_DAY * MS_PER_SECOND

/** A `.eth` second-level name, the only names a registrar grace applies to. */
export const isEth2ld = (name: string): boolean => {
  const labels = name.split('.')
  return labels.length === 2 && labels[1] === 'eth'
}

export const addMs = (date: Date | null, ms: number): Date | null =>
  date === null ? null : new Date(date.getTime() + ms)

/** A hash as the indexers serve it, lower-cased; the zero hash for anything else. */
export const toHash = (value: string | null | undefined): Hex => {
  const lower = value?.toLowerCase()
  return lower && isHex(lower) ? lower : zeroHash
}
