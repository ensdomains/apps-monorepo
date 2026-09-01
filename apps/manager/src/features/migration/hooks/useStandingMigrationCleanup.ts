import { useQuery } from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
import { usePublicClient } from 'wagmi'
import {
  getGrantedMigrationCleanupApprovals,
  type MigrationCleanupApproval,
} from '@/features/migration/service/migrationApprovals'

export const STANDING_MIGRATION_CLEANUP_QUERY_KEY = 'migration-standing-cleanup'

type HookParams = {
  readonly ownerAddress: Address | undefined
  readonly hcaAddress: Address | undefined
  readonly enabled?: boolean
}

/**
 * Live-reads whether a temporary migration grant (the registry-wide
 * `setApprovalForAll` to the HCA) is still standing on-chain for this wallet.
 *
 * This must not depend on any migration plan or name selection: the grant can
 * outlive both — an interrupted session may leave it standing after the
 * wallet's final v1 name migrated, when no migration run will ever be
 * started again.
 */
export const useStandingMigrationCleanup = ({
  ownerAddress,
  hcaAddress,
  enabled = true,
}: HookParams) => {
  const publicClient = usePublicClient()

  return useQuery<readonly MigrationCleanupApproval[]>({
    queryKey: [
      STANDING_MIGRATION_CLEANUP_QUERY_KEY,
      ownerAddress?.toLowerCase() ?? '',
      hcaAddress?.toLowerCase() ?? '',
    ] as const,
    enabled: enabled && !!ownerAddress && !!hcaAddress && !!publicClient,
    refetchOnWindowFocus: false,
    queryFn: () => {
      if (!ownerAddress || !hcaAddress || !publicClient) return []
      return getGrantedMigrationCleanupApprovals({
        eoa: ownerAddress,
        hcaAddress,
        publicClient: publicClient as unknown as PublicClient,
      })
    },
  })
}
