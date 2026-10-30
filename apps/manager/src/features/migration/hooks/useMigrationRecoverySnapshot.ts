import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { chain } from '@/config'
import { bigname } from '@/lib/bigname'
import { useSmartAccountContext } from '@/lib/smart-account'
import {
  getMigrationBatchJournalRevision,
  getServerMigrationBatchJournalRevision,
  hasMigrationRecoveryAttempt,
  loadMigrationBatchJournal,
  type loadMigrationRecoverySnapshot,
  type MigrationBatchJournalScope,
  removeMigrationRecoverySnapshot,
  subscribeMigrationBatchJournal,
} from '../service/migrationBatchJournal'
import { getMigrationRecoveryQueryOptions } from '../service/reconcileMigrationRecovery'

type RecoveryState = {
  readonly snapshot: ReturnType<typeof loadMigrationRecoverySnapshot>
  readonly discardedScope: MigrationBatchJournalScope | null
}

export const useMigrationRecoverySnapshot = () => {
  const publicClient = usePublicClient({ chainId: chain.id })
  const { ownerAddress, accountAddress: hcaAddress } = useSmartAccountContext()
  const chainId = publicClient?.chain?.id
  const journalRevision = useSyncExternalStore(
    subscribeMigrationBatchJournal,
    getMigrationBatchJournalRevision,
    getServerMigrationBatchJournalRevision,
  )

  const scope = useMemo(
    () =>
      chainId && ownerAddress && hcaAddress
        ? {
            chainId,
            owner: ownerAddress as Address,
            hca: hcaAddress as Address,
          }
        : undefined,
    [chainId, ownerAddress, hcaAddress],
  )
  useQuery(
    getMigrationRecoveryQueryOptions({
      scope,
      publicClient,
      historyClient: bigname,
      journalRevision,
    }),
  )

  const recoveryState = useMemo<RecoveryState>(() => {
    // The external-store revision deliberately invalidates this cached read.
    void journalRevision
    if (
      !chainId ||
      !ownerAddress ||
      !hcaAddress ||
      typeof globalThis.localStorage === 'undefined'
    ) {
      return { snapshot: null, discardedScope: null }
    }

    const scope = {
      chainId,
      owner: ownerAddress as Address,
      hca: hcaAddress as Address,
    }
    const journal = loadMigrationBatchJournal(scope)
    const snapshot = journal.recovery
    if (!snapshot) return { snapshot: null, discardedScope: null }

    const hasRecordedAttempt = hasMigrationRecoveryAttempt(journal)

    return hasRecordedAttempt
      ? { snapshot, discardedScope: null }
      : { snapshot: null, discardedScope: scope }
  }, [chainId, ownerAddress, hcaAddress, journalRevision])

  useEffect(() => {
    if (!recoveryState.discardedScope) return
    removeMigrationRecoverySnapshot(recoveryState.discardedScope)
  }, [recoveryState.discardedScope])

  return recoveryState.snapshot
}
