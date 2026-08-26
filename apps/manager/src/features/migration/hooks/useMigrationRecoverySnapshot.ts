import { useEffect, useMemo } from 'react'
import type { Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { useSmartAccountContext } from '@/lib/smart-account'
import {
  loadMigrationRecoverySnapshot,
  loadPendingAtomicMigrationIntents,
  loadSubmittedAtomicMigrationBatches,
  type MigrationBatchJournalScope,
  removeMigrationRecoverySnapshot,
} from '../service/migrationBatchJournal'

type RecoveryState = {
  readonly snapshot: ReturnType<typeof loadMigrationRecoverySnapshot>
  readonly discardedScope: MigrationBatchJournalScope | null
}

export const useMigrationRecoverySnapshot = () => {
  const publicClient = usePublicClient()
  const { ownerAddress, accountAddress: hcaAddress } = useSmartAccountContext()
  const chainId = publicClient?.chain?.id

  const recoveryState = useMemo<RecoveryState>(() => {
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
    const snapshot = loadMigrationRecoverySnapshot(scope)
    if (!snapshot) return { snapshot: null, discardedScope: null }

    const hasRecordedAttempt =
      snapshot.completedOperations.length > 0 ||
      loadPendingAtomicMigrationIntents(scope).length > 0 ||
      loadSubmittedAtomicMigrationBatches(scope).length > 0

    return hasRecordedAttempt
      ? { snapshot, discardedScope: null }
      : { snapshot: null, discardedScope: scope }
  }, [chainId, ownerAddress, hcaAddress])

  useEffect(() => {
    if (!recoveryState.discardedScope) return
    removeMigrationRecoverySnapshot(recoveryState.discardedScope)
  }, [recoveryState.discardedScope])

  return recoveryState.snapshot
}
