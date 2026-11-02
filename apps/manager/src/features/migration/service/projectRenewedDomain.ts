import type { V1Domain } from '@ens-apps/migration'
import {
  SECONDS_PER_DAY,
  V1_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'

const GRACE_PERIOD = BigInt(V1_GRACE_PERIOD_DAYS * SECONDS_PER_DAY)

/** A `.eth` 2LD as it reads once renewed to `targetExpiry`. */
export const projectRenewedDomain = (
  domain: V1Domain,
  targetExpiry: bigint,
): V1Domain => ({
  ...domain,
  // ETHRenewerV1 extends the ENSv2 reservation as well as the v1 lease.
  isUnreserved: undefined,
  registration: { expiryDate: targetExpiry.toString() },
  wrappedDomain: domain.wrappedDomain
    ? {
        ...domain.wrappedDomain,
        expiryDate: (targetExpiry + GRACE_PERIOD).toString(),
      }
    : null,
})
