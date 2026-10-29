import type { Address } from 'viem'
import {
  type ClassifiedName,
  classifyNames,
  type IneligibleName,
} from '@/features/migration/service/classifyNames'
import { GRACE_RENEWAL_EXTENSION } from '@/features/migration/service/graceRenewal'
import { projectRenewedDomain } from '@/features/migration/service/projectRenewedDomain'

type MigratableNames = {
  readonly eligible: readonly ClassifiedName[]
  readonly verifiedSubnames: readonly ClassifiedName[]
}

/**
 * Names in grace as they will read once renewed, at the shortest renewal a
 * grace quote produces. Only these can be checked for the upgrade.
 */
export const classifyRenewedGraceNames = ({
  gracePeriodNames,
  ownerAddress,
  chainId,
  nowSeconds,
}: {
  readonly gracePeriodNames: readonly IneligibleName[]
  readonly ownerAddress: Address
  readonly chainId: Parameters<typeof classifyNames>[2]
  readonly nowSeconds: bigint
}): readonly ClassifiedName[] =>
  classifyNames(
    gracePeriodNames.map(({ domain }) =>
      projectRenewedDomain(domain, nowSeconds + GRACE_RENEWAL_EXTENSION),
    ),
    ownerAddress,
    chainId,
  ).classified.filter(({ action }) => action === 'migrate')

/** Namehashes of the ENSv1 names an upgrade can move. */
export const getMigrationEligibleKeys = ({
  classified,
  eligibility,
  graceEligibility,
}: {
  readonly classified: readonly ClassifiedName[]
  readonly eligibility:
    | (MigratableNames & {
        readonly needsWrapperSync: readonly ClassifiedName[]
      })
    | undefined
  /** A name in grace counts only once its renewed form passes the check. */
  readonly graceEligibility: MigratableNames | undefined
}): ReadonlySet<string> =>
  new Set(
    [
      ...(eligibility?.eligible ?? classified),
      ...(eligibility?.needsWrapperSync ?? []),
      ...(eligibility?.verifiedSubnames ?? []),
      ...(graceEligibility?.eligible ?? []),
      ...(graceEligibility?.verifiedSubnames ?? []),
    ].map(({ domain }) => domain.id.toLowerCase()),
  )
