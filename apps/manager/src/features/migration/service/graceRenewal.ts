import {
  GRACE_PERIOD_DAYS,
  MS_PER_DAY,
} from '@/features/grace/utils/gracePeriod'

export const V1_GRACE_RENEWAL_BUFFER_DAYS = 7
export const V1_GRACE_LOCAL_TEST_FUTURE_DAYS = 30

const MS_PER_SECOND = 1000
const SECONDS_PER_DAY = 24 * 60 * 60

export const V1_GRACE_PERIOD_SECONDS = GRACE_PERIOD_DAYS * SECONDS_PER_DAY
export const V1_MIN_RENEWAL_DURATION_SECONDS = 28 * SECONDS_PER_DAY

export const getV1GraceRenewalDurationSeconds = (
  expiryDate: Date,
  now: Date = new Date(),
): number => {
  const debtSeconds = Math.max(
    0,
    Math.ceil((now.getTime() - expiryDate.getTime()) / MS_PER_SECOND),
  )
  return Math.max(
    debtSeconds + V1_GRACE_RENEWAL_BUFFER_DAYS * SECONDS_PER_DAY,
    V1_MIN_RENEWAL_DURATION_SECONDS,
  )
}

export const getV1GraceFetchCutoffSeconds = (now: Date = new Date()): string =>
  Math.floor(
    (now.getTime() - GRACE_PERIOD_DAYS * MS_PER_DAY) / MS_PER_SECOND,
  ).toString()

export const isV1GraceLocalTestFutureExpiry = (
  expiryDate: Date,
  now: Date = new Date(),
): boolean => {
  if (!import.meta.env.DEV) return false
  const msUntilExpiry = expiryDate.getTime() - now.getTime()
  return (
    msUntilExpiry > 0 &&
    msUntilExpiry <= V1_GRACE_LOCAL_TEST_FUTURE_DAYS * MS_PER_DAY
  )
}
