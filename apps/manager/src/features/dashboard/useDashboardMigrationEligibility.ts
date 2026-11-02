import {
  type UseQueryResult,
  useQueries,
  useQuery,
} from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { envConfig } from '@/config'
import {
  getGraceRenewalEligibilityQueryOptions,
  getMigrationEligibilityQueryOptions,
  useIsSubnameImportEnabled,
} from '@/features/migration/hooks/useMigrationEligibility'
import { useV1NameClassificationTime } from '@/features/migration/hooks/useV1NameClassificationTime'
import { getV1NamesQueryOptions } from '@/features/migration/hooks/useV1Names'
import { useSmartAccountContext } from '@/lib/smart-account'
import {
  classifyForHolders,
  getMigrationHolders,
  getUpgradeKeys,
} from './dashboardMigrationEligibility'

// Module-level so useQueries memoizes the combined result.
const combineEligibility = <T>(results: readonly UseQueryResult<T>[]) => ({
  data: results.map(({ data }) => data),
  isPending: results.map(({ isPending }) => isPending),
})

/**
 * Namehashes of the ENSv1 names of `address` (the connected owner by default)
 * that the connected owner can upgrade, and of those that whoever holds them
 * can upgrade: a name the viewer manages, or someone else's.
 */
export const useDashboardMigrationEligibility = ({
  address,
}: {
  readonly address?: Address
} = {}) => {
  const { ownerAddress } = useSmartAccountContext()
  const { address: connectedAddress } = useConnection()
  const viewer = ownerAddress ?? connectedAddress
  const namesAddress = address ?? viewer
  const {
    data: v1Names,
    isPending,
    isError,
  } = useQuery(getV1NamesQueryOptions(namesAddress))
  const nowSeconds = useV1NameClassificationTime(v1Names)
  const isSubnameImportEnabled = useIsSubnameImportEnabled()

  const holders = useMemo(
    () =>
      v1Names
        ? classifyForHolders({
            domains: v1Names,
            holders: getMigrationHolders(v1Names),
            chainId: envConfig.chain.id,
            nowSeconds,
          })
        : [],
    [v1Names, nowSeconds],
  )

  const eligibilities = useQueries({
    queries: holders.map(({ holder, classified }) =>
      getMigrationEligibilityQueryOptions({
        names: classified,
        ownerAddress: holder,
        isSubnameImportEnabled,
      }),
    ),
    combine: combineEligibility,
  })
  const graceEligibilities = useQueries({
    queries: holders.map(({ holder, renewedGraceNames }) =>
      getGraceRenewalEligibilityQueryOptions({
        names: renewedGraceNames,
        ownerAddress: holder,
        isSubnameImportEnabled,
      }),
    ),
    combine: combineEligibility,
  })

  const { eligibleKeys, upgradeableKeys } = useMemo(
    () =>
      getUpgradeKeys({
        holders,
        eligibilities: eligibilities.data,
        graceEligibilities: graceEligibilities.data,
        viewer,
      }),
    [holders, viewer, eligibilities, graceEligibilities],
  )

  const isEligibilityPending = holders.some(
    ({ classified, renewedGraceNames }, index) =>
      (classified.length > 0 && eligibilities.isPending[index]) ||
      (renewedGraceNames.length > 0 && graceEligibilities.isPending[index]),
  )

  return {
    eligibleKeys,
    upgradeableKeys,
    isPending: isPending || isEligibilityPending,
    isError,
  }
}
