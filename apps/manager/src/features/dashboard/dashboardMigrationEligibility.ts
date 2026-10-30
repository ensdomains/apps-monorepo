import type { V1Domain } from '@ens-apps/migration'
import { match } from 'ts-pattern'
import {
  type Address,
  getAddress,
  isAddress,
  isAddressEqual,
  zeroAddress,
} from 'viem'
import { getGracePeriodNames } from '@/features/migration/hooks/useEligibleV1Names.helpers'
import {
  type ClassifiedName,
  classifyNames,
  type IneligibleName,
} from '@/features/migration/service/classifyNames'
import { GRACE_RENEWAL_EXTENSION } from '@/features/migration/service/graceRenewal'
import { projectRenewedDomain } from '@/features/migration/service/projectRenewedDomain'
import type { NameStatus } from './components/NameRow'

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

/**
 * Every address that could hold the token an upgrade moves: the registrant of
 * a `.eth` name, the owner of a wrapped one, the registry owner of a subname.
 * The classifier skips a name for any address that does not hold it.
 */
export const getMigrationHolders = (
  domains: readonly V1Domain[],
): readonly Address[] => [
  ...new Set(
    domains
      .flatMap(({ registrant, wrappedOwner, owner }) => [
        registrant?.id,
        wrappedOwner?.id,
        owner.id,
      ])
      .filter(
        (id): id is Address =>
          !!id && isAddress(id) && id.toLowerCase() !== zeroAddress,
      )
      .map((id) => getAddress(id)),
  ),
]

export type HolderNames = {
  readonly holder: Address
  readonly classified: readonly ClassifiedName[]
  readonly renewedGraceNames: readonly ClassifiedName[]
}

/** The names each holder can upgrade, now or once renewed out of grace. */
export const classifyForHolders = ({
  domains,
  holders,
  chainId,
  nowSeconds,
}: {
  readonly domains: readonly V1Domain[]
  readonly holders: readonly Address[]
  readonly chainId: Parameters<typeof classifyNames>[2]
  readonly nowSeconds: bigint
}): readonly HolderNames[] =>
  holders
    .map((holder) => {
      const { classified, ineligible } = classifyNames(domains, holder, chainId)
      return {
        holder,
        classified,
        renewedGraceNames: classifyRenewedGraceNames({
          gracePeriodNames: getGracePeriodNames(ineligible, nowSeconds),
          ownerAddress: holder,
          chainId,
          nowSeconds,
        }),
      }
    })
    .filter(
      ({ classified, renewedGraceNames }) =>
        classified.length > 0 || renewedGraceNames.length > 0,
    )

type HolderEligibility = Parameters<
  typeof getMigrationEligibleKeys
>[0]['eligibility']

/**
 * The names the viewer can upgrade, and those any holder can. Each holder's
 * results sit at the holder's index; one still loading counts its names.
 */
export const getUpgradeKeys = ({
  holders,
  eligibilities,
  graceEligibilities,
  viewer,
}: {
  readonly holders: readonly HolderNames[]
  readonly eligibilities: readonly HolderEligibility[]
  readonly graceEligibilities: readonly (MigratableNames | undefined)[]
  readonly viewer: Address | undefined
}): {
  readonly eligibleKeys: ReadonlySet<string>
  readonly upgradeableKeys: ReadonlySet<string>
} => {
  const keysByHolder = holders.map(({ holder, classified }, index) => ({
    holder,
    keys: getMigrationEligibleKeys({
      classified,
      eligibility: eligibilities[index],
      graceEligibility: graceEligibilities[index],
    }),
  }))
  return {
    eligibleKeys: new Set(
      keysByHolder.flatMap(({ holder, keys }) =>
        viewer && isAddressEqual(holder, viewer) ? [...keys] : [],
      ),
    ),
    upgradeableKeys: new Set(keysByHolder.flatMap(({ keys }) => [...keys])),
  }
}

/**
 * The ENSv1 label: the viewer can upgrade it, someone else can (the owner of a
 * name the viewer manages or only looks at), or nobody can.
 */
export const getV1NameStatus = ({
  isEligible,
  isUpgradeable,
}: {
  /** The connected viewer can upgrade it. */
  readonly isEligible: boolean
  /** Its holder can upgrade it, whoever is viewing. */
  readonly isUpgradeable: boolean
}): NameStatus =>
  match({ isEligible, isUpgradeable })
    .with({ isEligible: true }, () => 'eligibleUpgrade' as const)
    .with({ isUpgradeable: true }, () => 'ensv1' as const)
    .otherwise(() => 'ensv1Only' as const)
