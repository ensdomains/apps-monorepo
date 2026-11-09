import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions, useQuery } from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
import { chain } from '@/config'
import type { ClassifiedName } from '@/features/migration/service/classifyNames'
import { resolveMigratableNames } from '@/features/migration/service/migratableNames'
import { runEligibilityChecks } from '@/features/migration/service/preflightChecks'
import { publicClient } from '@/lib/wagmi'
import { V1_CONTRACTS } from '../contracts/addresses'
import type { RpcSubnameInventory } from '../service/readRpcSubnameInventory'
import { getRpcSubnameInventoryCacheKey } from '../service/rpcSubnameInventoryCache'
import type {
  UpgradeReadClients,
  UpgradeReadCoordinator,
} from '../service/upgradeReadCoordinator'
import { useUpgradeReadCoordinator } from '../state/upgradeReadCoordinator.context'

export type {
  BlockedSubnameMigration,
  SubnameMigrationBlockReason,
} from '@/features/migration/service/migratableNames'

const ELIGIBILITY_STALE_MS = 60_000

type EligibilityQueryParams = {
  readonly coordinator?: UpgradeReadCoordinator
  readonly names: readonly ClassifiedName[]
  readonly ownerAddress?: string | null
}

export const getMigrationEligibilityQueryOptions = ({
  names,
  ownerAddress,
  coordinator,
}: EligibilityQueryParams) =>
  queryOptions({
    queryKey: qk('migration', 'eligibility', {
      ...(coordinator && { readScope: 'upgrade' }),
      owner: ownerAddress?.toLowerCase(),
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
    queryFn: async ({ signal, client: queryClient }) => {
      const owner = ownerAddress as Address
      const read = async ({
        publicClient: client,
        verificationClient,
      }: UpgradeReadClients) => {
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
            owner,
            publicClient: client,
            verificationClient,
            previousInventory:
              queryClient.getQueryData<RpcSubnameInventory>(inventoryKey),
            onInventory: (inventory) => {
              signal.throwIfAborted()
              queryClient.setQueryData(inventoryKey, inventory)
            },
            signal,
          })),
        }
      }
      return coordinator
        ? coordinator.run({ owner, signal }, read)
        : read({
            publicClient: publicClient as PublicClient,
            verificationClient: publicClient as PublicClient,
          })
    },
    enabled: !!ownerAddress && names.length > 0,
    staleTime: ELIGIBILITY_STALE_MS,
    refetchOnWindowFocus: false,
    retry: false,
  })

export const useMigrationEligibility = (
  names: readonly ClassifiedName[],
  ownerAddress?: string | null,
) => {
  const coordinator = useUpgradeReadCoordinator()
  return useQuery(
    getMigrationEligibilityQueryOptions({
      names,
      ownerAddress,
      coordinator: coordinator ?? undefined,
    }),
  )
}

/**
 * The upgrade's subname check for names in grace, as they will read once
 * renewed. Skips the live ownership and reservation reads: the renewal
 * restores the reservation, and the upgrade page reads neither before it.
 */
export const getGraceRenewalEligibilityQueryOptions = ({
  names,
  ownerAddress,
  coordinator,
}: EligibilityQueryParams) =>
  queryOptions({
    queryKey: qk('migration', 'grace-renewal-eligibility', {
      ...(coordinator && { readScope: 'upgrade' }),
      owner: ownerAddress?.toLowerCase(),
      names: names.map((name) => ({
        id: name.domain.id,
        action: name.action,
        tokenType: name.tokenType,
        fuses: name.fuses.toString(),
        resolver: name.v1ResolverAddress,
      })),
    }),
    queryFn: ({ signal }) => {
      const read = ({
        publicClient: client,
        verificationClient,
      }: UpgradeReadClients) =>
        resolveMigratableNames({
          eligible: names,
          owner: ownerAddress as Address,
          publicClient: client,
          verificationClient,
          signal,
        })
      return coordinator
        ? coordinator.run(
            { owner: ownerAddress as Address, signal, mode: 'after-renewal' },
            read,
          )
        : read({
            publicClient: publicClient as PublicClient,
            verificationClient: publicClient as PublicClient,
          })
    },
    enabled: !!ownerAddress && names.length > 0,
    staleTime: ELIGIBILITY_STALE_MS,
    refetchOnWindowFocus: false,
    retry: false,
  })
