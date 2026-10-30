import type { BignameClient } from '@ens-apps/indexer/bigname'
import { getDestinationContracts } from '@ens-apps/smart-account'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions, skipToken } from '@tanstack/react-query'
import { type Address, type Hex, isAddressEqual, type PublicClient } from 'viem'
import {
  loadMigrationBatchJournal,
  type MigrationBatchJournalScope,
  type MigrationJournalOperation,
  removeMigrationRecoverySnapshot,
  settleConfirmedMigrationBatch,
} from './migrationBatchJournal'
import {
  restoreMigrationCompletionCheckpoint,
  verifyAndPersistMigrationCompletionCheckpoint,
  verifyMigrationRecoveryTransaction,
} from './migrationCompletionCheckpoint'
import { hasCompletedMigrationRecovery } from './migrationRecoveryProgress'

type RecoveryParams = {
  readonly scope: MigrationBatchJournalScope
  readonly publicClient: PublicClient
  readonly historyClient: Pick<BignameClient, 'nameHistory'>
  readonly signal?: AbortSignal
  readonly journal?: ReturnType<typeof loadMigrationBatchJournal>
}

type RecoveryAttempt = {
  readonly intentId: string
  readonly names: readonly string[]
  readonly operations: readonly MigrationJournalOperation[]
  readonly hashes: readonly Hex[]
  readonly migrationHelper: Address
}

const getRecoveryAttempts = (
  journal: ReturnType<typeof loadMigrationBatchJournal>,
  helper: Address,
): readonly RecoveryAttempt[] => [
  ...journal.submitted.map((batch) => ({
    ...batch,
    hashes: [batch.hash],
    migrationHelper:
      batch.migrationHelper ?? journal.recovery?.migrationHelper ?? helper,
  })),
  ...journal.pending
    .filter(
      ({ id }) => !journal.submitted.some(({ intentId }) => intentId === id),
    )
    .map((intent) => ({
      ...intent,
      intentId: intent.id,
      hashes: [],
      migrationHelper: journal.recovery?.migrationHelper ?? helper,
    })),
]

const getCandidateHashes = async (
  params: RecoveryParams,
  attempt: RecoveryAttempt,
): Promise<readonly Hex[]> => {
  if (attempt.hashes.length > 0) return attempt.hashes
  const operation = attempt.operations[0]
  if (!operation) return []
  return params.historyClient
    .nameHistory(
      operation.name,
      {
        type: operation.action === 'migrate' ? ['migration'] : ['registration'],
        page_size: 10,
      },
      { signal: params.signal },
    )
    .match(
      ({ data }) =>
        data.flatMap(({ transaction_hash }) =>
          transaction_hash ? [transaction_hash] : [],
        ),
      () => [],
    )
}

const settleVerifiedAttempt = async (
  params: RecoveryParams,
  attempt: RecoveryAttempt,
  hash: Hex,
  helper: Address,
): Promise<boolean> => {
  try {
    const verification = {
      scope: params.scope,
      publicClient: params.publicClient,
      transactionHash: hash,
      operations: attempt.operations,
      signal: params.signal,
    }
    if (isAddressEqual(attempt.migrationHelper, helper)) {
      await verifyAndPersistMigrationCompletionCheckpoint(verification)
    } else {
      const status = await verifyMigrationRecoveryTransaction({
        ...verification,
        migrationHelper: attempt.migrationHelper,
      })
      if (status !== 'success') return false
    }
    params.signal?.throwIfAborted()
    settleConfirmedMigrationBatch(params.scope, { ...attempt, hash })
    return true
  } catch {
    params.signal?.throwIfAborted()
    // Pending, reverted, unreadable or mismatched evidence retains retry protection.
    return false
  }
}

const settleCompletedRecovery = async (
  params: RecoveryParams,
  journal: ReturnType<typeof loadMigrationBatchJournal>,
) => {
  if (!hasCompletedMigrationRecovery(journal)) return journal
  try {
    const checkpoint = await restoreMigrationCompletionCheckpoint(params)
    params.signal?.throwIfAborted()
    const current = loadMigrationBatchJournal(params.scope)
    if (
      checkpoint &&
      hasCompletedMigrationRecovery(current) &&
      current.recovery?.completedOperations.some(
        ({ name, action }) =>
          name === checkpoint.name && action === checkpoint.action,
      )
    )
      removeMigrationRecoverySnapshot(params.scope)
    return loadMigrationBatchJournal(params.scope)
  } catch {
    params.signal?.throwIfAborted()
    return journal
  }
}

/** History supplies candidate hashes only; canonical receipts and calldata prove completion. */
export const reconcileMigrationRecovery = async (params: RecoveryParams) => {
  const journal = params.journal ?? loadMigrationBatchJournal(params.scope)
  const helper = getDestinationContracts(params.scope.chainId).migrationHelper
  const attempts = getRecoveryAttempts(journal, helper)
  if (attempts.length === 0) {
    const settled = await settleCompletedRecovery(params, journal)
    return {
      hasUnresolvedAttempts: hasCompletedMigrationRecovery(settled),
      journal: settled,
    }
  }
  for (const attempt of attempts) {
    params.signal?.throwIfAborted()
    for (const hash of await getCandidateHashes(params, attempt)) {
      if (await settleVerifiedAttempt(params, attempt, hash, helper)) break
    }
  }
  const remaining = loadMigrationBatchJournal(params.scope)
  return {
    hasUnresolvedAttempts:
      remaining.pending.length > 0 || remaining.submitted.length > 0,
    journal: remaining,
  }
}

export const getMigrationRecoveryQueryOptions = (params: {
  readonly scope: MigrationBatchJournalScope | undefined
  readonly publicClient: PublicClient | undefined
  readonly historyClient: RecoveryParams['historyClient']
  readonly journalRevision: number
}) => {
  const { scope, publicClient, historyClient } = params
  return queryOptions({
    queryKey: qk('migration', 'recovery_reconciliation', {
      chainId: scope?.chainId,
      owner: scope?.owner.toLowerCase(),
      hca: scope?.hca.toLowerCase(),
      journalRevision: params.journalRevision,
    }),
    queryFn:
      scope && publicClient
        ? ({ signal }) =>
            reconcileMigrationRecovery({
              scope,
              publicClient,
              historyClient,
              signal,
            })
        : skipToken,
    retry: false,
    refetchOnWindowFocus: 'always',
    refetchInterval: (query) =>
      query.state.data?.hasUnresolvedAttempts ? 10_000 : false,
  })
}
