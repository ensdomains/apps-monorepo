import { differenceInCalendarDays, startOfDay } from 'date-fns'
import {
  MIN_RENEW_DURATION_SECONDS,
  SECONDS_PER_DAY,
} from '@/features/shared/registration/pricing'

/**
 * Seconds a renewal has to cover. A day is enough for a live name, but an
 * expired one is renewed from the expiry it already has, so a short renewal
 * would be paid for and leave the name expired. Carrying it past today is what
 * takes it back out of grace.
 */
export const getMinRenewDurationSeconds = ({
  expiry,
  now,
  requireFutureExpiry,
}: {
  readonly expiry: Date
  readonly now: Date
  readonly requireFutureExpiry: boolean
}): number => {
  if (!requireFutureExpiry) return MIN_RENEW_DURATION_SECONDS

  const daysPastExpiry = differenceInCalendarDays(
    startOfDay(now),
    startOfDay(expiry),
  )

  return Math.max(
    MIN_RENEW_DURATION_SECONDS,
    (daysPastExpiry + 1) * SECONDS_PER_DAY,
  )
}
