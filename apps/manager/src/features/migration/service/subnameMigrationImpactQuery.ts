import {
  getSubnameMigrationImpact,
  type SubnameMigrationImpact,
  SubnameMigrationImpactError,
} from '@ens-apps/migration'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import type { QueryClient } from '@tanstack/react-query'
import { fromPromise } from 'neverthrow'
import type { PublicClient } from 'viem'
import { bigname } from '@/lib/bigname'
import { publicClient } from '@/lib/wagmi'
import { getMigrationInventoryIndexer } from './migrationInventoryIndexer'

type Scope = {
  readonly ownerAddress?: string | null
  readonly chainId: number
  readonly migratingNames: readonly string[]
  readonly copiedNames: readonly string[]
  readonly renewingNames: readonly string[]
}

const FRESH_FOR_MS = 60_000
const normalizedNames = (names: readonly string[]) =>
  [...new Set(names.map((name) => name.toLowerCase()))].sort()
const getImpactInputs = (scope: Scope) => ({
  migratingNames: normalizedNames(scope.migratingNames),
  copiedNames: normalizedNames(scope.copiedNames),
  renewingNames: normalizedNames(scope.renewingNames),
})
const getImpactQueryKey = (scope: Scope) =>
  qk('migration', 'subname_impact', {
    owner: scope.ownerAddress?.toLowerCase(),
    chainId: scope.chainId,
    ...getImpactInputs(scope),
  })

export const getSubnameMigrationImpactQueryOptions = (
  params: Scope & {
    readonly isEnabled: boolean
    readonly isPrepared: boolean
    readonly hasSelectedNames: boolean
    readonly isRefetchEnabled?: boolean
  },
) => {
  const {
    isEnabled,
    isPrepared,
    hasSelectedNames,
    isRefetchEnabled = true,
  } = params
  return resultQueryOptions({
    queryKey: getImpactQueryKey(params),
    queryFn: ({ signal }) => {
      const requestSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(120_000),
      ])
      const inputs = getImpactInputs(params)
      return fromPromise(
        getMigrationInventoryIndexer({
          indexer: bigname,
          ownerAddress: params.ownerAddress,
          names: inputs.migratingNames,
          chainId: params.chainId,
          signal: requestSignal,
        }),
        (cause) => new SubnameMigrationImpactError({ cause }),
      ).andThen((indexer) =>
        getSubnameMigrationImpact({
          indexer,
          publicClient: publicClient as PublicClient,
          shouldSkipEmptySubtrees: true,
          ...inputs,
          signal: requestSignal,
        }),
      )
    },
    enabled: isEnabled && isPrepared && hasSelectedNames,
    staleTime: FRESH_FOR_MS,
    refetchInterval: isEnabled && isRefetchEnabled ? FRESH_FOR_MS : false,
    refetchOnWindowFocus: isRefetchEnabled ? 'always' : false,
    retry: false,
  })
}

const shouldPublishPreparedImpact = (params: {
  readonly hasActiveVerification: boolean
  readonly latestObservationAt: number
  readonly impact: SubnameMigrationImpact
}) =>
  !params.hasActiveVerification &&
  params.impact.affectedCount === 0 &&
  params.latestObservationAt < params.impact.checkedAt

/** Display may reuse preparation; newer failures and fresh checks always win. */
export const publishPreparedSubnameImpact = (
  params: Scope & {
    readonly queryClient: QueryClient
    readonly impact: SubnameMigrationImpact
  },
): void => {
  const key = getImpactQueryKey(params)
  const state = params.queryClient.getQueryState<SubnameMigrationImpact>(key)
  if (
    !shouldPublishPreparedImpact({
      hasActiveVerification:
        state !== undefined && state.fetchStatus !== 'idle',
      latestObservationAt: Math.max(
        state?.dataUpdatedAt ?? 0,
        state?.errorUpdatedAt ?? 0,
        state?.data?.checkedAt ?? 0,
      ),
      impact: params.impact,
    })
  )
    return
  params.queryClient.setQueryData(key, params.impact, {
    updatedAt: params.impact.checkedAt,
  })
}
