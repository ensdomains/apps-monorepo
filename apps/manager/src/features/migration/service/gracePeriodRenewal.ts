import {
  SECONDS_PER_DAY,
  V1_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, ResultAsync } from 'neverthrow'
import { getExpiry } from '@/features/profile/service/profileExpiry'
import { getIsV1Renewable } from '@/features/renew/data/queries/v1Renewable.query'

export const GRACE_RENEWAL_BUFFER_SECONDS = 7n * BigInt(SECONDS_PER_DAY)
const GRACE_PERIOD_SECONDS =
  BigInt(V1_GRACE_PERIOD_DAYS) * BigInt(SECONDS_PER_DAY)

/** Pay the elapsed grace period plus one week of active registration. */
export const getGraceRenewalDuration = (
  expiry: bigint,
  nowSeconds: bigint = BigInt(Math.floor(Date.now() / 1000)),
): bigint | null => {
  if (expiry > nowSeconds || nowSeconds >= expiry + GRACE_PERIOD_SECONDS) {
    return null
  }
  return nowSeconds - expiry + GRACE_RENEWAL_BUFFER_SECONDS
}

class GracePeriodRenewalUnavailableError extends TaggedError(
  'GracePeriodRenewalUnavailableError',
)<{ readonly name: string }> {}

export const getGracePeriodRenewalQuote = (name: string) =>
  ResultAsync.combine([getExpiry(name, 'v1'), getIsV1Renewable(name)]).andThen(
    ([expiryData, isRenewable]) => {
      const currentExpiry = expiryData.expiry
      const duration =
        currentExpiry === null ? null : getGraceRenewalDuration(currentExpiry)
      if (!isRenewable || currentExpiry === null || duration === null) {
        return err(new GracePeriodRenewalUnavailableError({ name }))
      }
      return ok({ currentExpiry, duration })
    },
  )
