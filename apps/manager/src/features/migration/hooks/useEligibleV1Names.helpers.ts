import {
  SECONDS_PER_DAY,
  V1_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import type { IneligibleName } from '../service/classifyNames'

const V1_GRACE_PERIOD_SECONDS =
  BigInt(V1_GRACE_PERIOD_DAYS) * BigInt(SECONDS_PER_DAY)

export const getGracePeriodNames = (
  ineligible: readonly IneligibleName[],
  nowSeconds: bigint = BigInt(Math.floor(Date.now() / 1000)),
): readonly IneligibleName[] =>
  ineligible
    .filter(({ domain, reason }) => {
      if (reason !== 'expired-registration' || domain.parent?.name !== 'eth') {
        return false
      }

      const registrationExpiry = domain.registration?.expiryDate
      if (registrationExpiry) {
        const expiry = BigInt(registrationExpiry)
        return (
          expiry <= nowSeconds && nowSeconds < expiry + V1_GRACE_PERIOD_SECONDS
        )
      }

      // The NameWrapper expiry includes the registration's 90-day grace period.
      const wrappedExpiry = domain.wrappedDomain?.expiryDate
      if (!wrappedExpiry) return false
      const expiry = BigInt(wrappedExpiry)
      return (
        expiry - V1_GRACE_PERIOD_SECONDS <= nowSeconds && nowSeconds < expiry
      )
    })
    .sort((a, b) => a.domain.name.localeCompare(b.domain.name))
