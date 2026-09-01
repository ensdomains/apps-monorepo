import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import type { Address } from 'viem'
import { usePublicClient } from 'wagmi'
import {
  getMigrationApprovalCleanupJournalRevision,
  getServerMigrationApprovalCleanupJournalRevision,
  subscribeMigrationApprovalCleanupJournal,
} from '@/features/migration/service/migrationApprovalCleanupJournal'
import {
  type MigrationApprovalCleanupStatus,
  readMigrationApprovalCleanupStatus,
} from '@/features/migration/service/readMigrationApprovalCleanupStatus'

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
  const chainId = publicClient?.chain?.id
  const journalRevision = useSyncExternalStore(
    subscribeMigrationApprovalCleanupJournal,
    getMigrationApprovalCleanupJournalRevision,
    getServerMigrationApprovalCleanupJournalRevision,
  )

  return useQuery<MigrationApprovalCleanupStatus>({
    queryKey: [
      STANDING_MIGRATION_CLEANUP_QUERY_KEY,
      chainId ?? 0,
      ownerAddress?.toLowerCase() ?? '',
      hcaAddress?.toLowerCase() ?? '',
      journalRevision,
    ] as const,
    enabled:
      enabled && !!chainId && !!ownerAddress && !!hcaAddress && !!publicClient,
    refetchInterval: (query) =>
      query.state.data?.pendingRevocationHash ? 4_000 : false,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    queryFn: () => {
      if (!chainId || !ownerAddress || !hcaAddress || !publicClient) {
        return { approvals: [] }
      }
      return readMigrationApprovalCleanupStatus({
        eoa: ownerAddress,
        hcaAddress,
        chainId,
        publicClient,
      })
    },
  })
}
