import {
  type SubnameMigrationImpact,
  SubnameMigrationImpactError,
} from '@ens-apps/migration'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import type { QueryClient } from '@tanstack/react-query'
import { fromPromise } from 'neverthrow'
import type { Address, PublicClient } from 'viem'
import { publicClient } from '@/lib/wagmi'
import { V1_CONTRACTS } from '../contracts/addresses'
import type { RpcSubnameInventory } from './readRpcSubnameInventory'
import { readRpcSubnameMigrationImpact } from './readRpcSubnameMigrationImpact'
import {
  getReusableRpcSubnameInventory,
  getRpcSubnameInventoryCacheKey,
} from './rpcSubnameInventoryCache'
import {
  getSubnameMigrationImpactRetryDelay,
  shouldRetrySubnameMigrationImpact,
} from './subnameMigrationImpactQuery.helpers'
import type { UpgradeReadCoordinator } from './upgradeReadCoordinator'

type Scope = {
  readonly ownerAddress?: string | null
  readonly chainId: number
  readonly migratingNames: readonly string[]
  readonly copiedNames: readonly string[]
  readonly renewingNames: readonly string[]
  /** Unknown-label subnames eligibility proved; a leaf among them is dropped rather than lost. */
  readonly unknownLabelNames?: readonly string[]
}

const FRESH_FOR_MS = 60_000
const normalizedNames = (names: readonly string[]) =>
  [...new Set(names.map((name) => name.toLowerCase()))].sort()
const getImpactInputs = (scope: Scope) => ({
  migratingNames: normalizedNames(scope.migratingNames),
  copiedNames: normalizedNames(scope.copiedNames),
  renewingNames: normalizedNames(scope.renewingNames),
  unknownLabelNames: normalizedNames(scope.unknownLabelNames ?? []),
})
const getImpactQueryKey = (scope: Scope) =>
  qk('migration', 'subname_impact', {
    owner: scope.ownerAddress?.toLowerCase(),
    chainId: scope.chainId,
    ...getImpactInputs(scope),
  })

export const getSubnameMigrationImpactQueryOptions = (
  params: Scope & {
    readonly coordinator?: UpgradeReadCoordinator
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
    queryFn: ({ signal, client: queryClient }) => {
      const requestSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(120_000),
      ])
      const inputs = getImpactInputs(params)
      const state = queryClient.getQueryState(getImpactQueryKey(params))
      // Only initial display may reuse preparation. Every subsequent decision
      // refetches without inventory, preserving the strict pre-start checks.
      const inventory =
        params.coordinator &&
        params.ownerAddress &&
        state?.dataUpdatedAt === 0 &&
        state.errorUpdatedAt === 0
          ? getReusableRpcSubnameInventory({
              inventory: queryClient.getQueryData<RpcSubnameInventory>(
                getRpcSubnameInventoryCacheKey({
                  ownerAddress: params.ownerAddress,
                  chainId: params.chainId,
                  registryAddress: V1_CONTRACTS.LegacyRegistry,
                  nameWrapperAddress: V1_CONTRACTS.NameWrapper,
                }),
              ),
              chainId: params.chainId,
              registryAddress: V1_CONTRACTS.LegacyRegistry,
              nameWrapperAddress: V1_CONTRACTS.NameWrapper,
              names: inputs.migratingNames,
            })
          : undefined
      const read = (client: PublicClient) =>
        readRpcSubnameMigrationImpact({
          publicClient: client,
          verificationClient: client,
          inventory,
          ...inputs,
          signal: requestSignal,
        })
      return fromPromise(
        params.coordinator && params.ownerAddress
          ? params.coordinator.run(
              { owner: params.ownerAddress as Address, signal: requestSignal },
              ({ verificationClient }) => read(verificationClient),
            )
          : read(publicClient as PublicClient),
        (cause) => new SubnameMigrationImpactError({ cause }),
      )
    },
    enabled: isEnabled && isPrepared && hasSelectedNames,
    staleTime: FRESH_FOR_MS,
    refetchInterval: isEnabled && isRefetchEnabled ? FRESH_FOR_MS : false,
    refetchOnWindowFocus: isRefetchEnabled ? 'always' : false,
    retry: (failureCount, error) =>
      shouldRetrySubnameMigrationImpact({ failureCount, cause: error.cause }),
    retryDelay: getSubnameMigrationImpactRetryDelay,
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
