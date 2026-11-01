import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useFeatureFlagEnabled } from '@posthog/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
import { chain } from '@/config'
import type { ClassifiedName } from '@/features/migration/service/classifyNames'
import { resolveMigratableNames } from '@/features/migration/service/migratableNames'
import { runEligibilityChecks } from '@/features/migration/service/preflightChecks'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { publicClient } from '@/lib/wagmi'
import { V1_CONTRACTS } from '../contracts/addresses'
import type { RpcSubnameInventory } from '../service/readRpcSubnameInventory'
import { getRpcSubnameInventoryCacheKey } from '../service/rpcSubnameInventoryCache'

export type {
  BlockedSubnameMigration,
  SubnameMigrationBlockReason,
} from '@/features/migration/service/migratableNames'

const ELIGIBILITY_STALE_MS = 60_000

export const useMigrationEligibility = (
  names: readonly ClassifiedName[],
  ownerAddress?: string | null,
) => {
  const queryClient = useQueryClient()
  const isSubnameImportEnabled =
    useFeatureFlagEnabled(
      POSTHOG_FEATURE_FLAGS.MIGRATION_SUBNAME_RECREATION,
      false,
    ) === true
  return useQuery({
    queryKey: qk('migration', 'eligibility', {
      owner: ownerAddress?.toLowerCase(),
      isSubnameImportEnabled,
      names: names.map((name) => ({
        id: name.domain.id,
        action: name.action,
        tokenType: name.tokenType,
        owner: name.tokenHolder,
        fuses: name.fuses.toString(),
        resolver: name.v1ResolverAddress,
        registrationExpiry: name.domain.registration?.expiryDate,
        wrappedExpiry: name.domain.wrappedDomain?.expiryDate,
      })),
    }),
    queryFn: async ({ signal }) => {
      const client = publicClient as PublicClient
      const owner = ownerAddress as Address
      const inventoryKey = getRpcSubnameInventoryCacheKey({
        ownerAddress: owner,
        chainId: chain.id,
        registryAddress: V1_CONTRACTS.LegacyRegistry,
        nameWrapperAddress: V1_CONTRACTS.NameWrapper,
      })
      const result = await runEligibilityChecks(client, [...names], owner)
      signal.throwIfAborted()
      return {
        ...result,
        ...(await resolveMigratableNames({
          eligible: result.eligible,
          isSubnameImportEnabled,
          owner,
          publicClient: client,
          previousInventory:
            queryClient.getQueryData<RpcSubnameInventory>(inventoryKey),
          onInventory: (inventory) => {
            signal.throwIfAborted()
            queryClient.setQueryData(inventoryKey, inventory)
          },
          signal,
        })),
      }
    },
    enabled: !!ownerAddress && names.length > 0,
    staleTime: ELIGIBILITY_STALE_MS,
    refetchOnWindowFocus: false,
    retry: false,
  })
}
