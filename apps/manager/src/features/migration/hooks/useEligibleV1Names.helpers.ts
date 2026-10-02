import {
  SECONDS_PER_DAY,
  V1_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import type { IneligibleName } from '../service/classifyNames'
import type { V1Domain } from '../service/v1SubgraphClient'

const V1_GRACE_PERIOD_SECONDS =
  BigInt(V1_GRACE_PERIOD_DAYS) * BigInt(SECONDS_PER_DAY)

export const getNextNameExpiryBoundary = (
  domains: readonly V1Domain[],
  nowSeconds: bigint,
): bigint | null => {
  const boundaries = domains.flatMap((domain) => {
    const wrappedExpiry = domain.wrappedDomain?.expiryDate
    const boundaries = wrappedExpiry ? [BigInt(wrappedExpiry)] : []
    if (domain.parent?.name !== 'eth') return boundaries

    const registrationExpiry = domain.registration?.expiryDate
    if (registrationExpiry) {
      const expiry = BigInt(registrationExpiry)
      return [...boundaries, expiry, expiry + V1_GRACE_PERIOD_SECONDS]
    }
    if (wrappedExpiry) {
      return [...boundaries, BigInt(wrappedExpiry) - V1_GRACE_PERIOD_SECONDS]
    }
    return boundaries
  })

  return boundaries.reduce<bigint | null>((next, boundary) => {
    if (boundary <= nowSeconds || (next !== null && boundary >= next)) {
      return next
    }
    return boundary
  }, null)
}

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
