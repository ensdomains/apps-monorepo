import type { Address, Hex, PublicClient } from 'viem'
import {
  loadMigrationApprovalCleanupAttempt,
  loadMigrationApprovalCleanupJournal,
  MigrationApprovalCleanupJournalCorruptError,
  type MigrationApprovalCleanupJournalScope,
  MigrationApprovalCleanupJournalUnavailableError,
  recordMigrationApprovalCleanupRevocationConfirmed,
  recordMigrationApprovalCleanupRevocationFailed,
} from './migrationApprovalCleanupJournal'
import {
  getGrantedMigrationCleanupApprovals,
  type MigrationCleanupApproval,
  migrationCleanupApprovalFor,
} from './migrationApprovals'

export type MigrationApprovalCleanupStatus = {
  readonly approvals: readonly MigrationCleanupApproval[]
  readonly pendingRevocationHash?: Hex
  readonly hasPendingPrompt?: boolean
}

type CleanupReadClient = Pick<
  PublicClient,
  'getTransaction' | 'getTransactionReceipt' | 'readContract'
>
type CleanupTransaction = Awaited<
  ReturnType<CleanupReadClient['getTransaction']>
>

export type MigrationApprovalCleanupCoverage =
  | 'covered'
  | 'not-covered'
  | 'unknown'

type DurableCleanupEvidence = {
  readonly exists: boolean
  readonly hasPendingPrompt: boolean
  readonly pendingRevocationHash?: Hex
}

const addressesEqual = (first: Address, second: Address): boolean =>
  first.toLowerCase() === second.toLowerCase()

const readCleanupTransaction = async (params: {
  readonly publicClient: Pick<PublicClient, 'getTransaction'>
  readonly hash: Hex
}): Promise<CleanupTransaction | null> => {
  try {
    return await params.publicClient.getTransaction({ hash: params.hash })
  } catch {
    return null
  }
}

const verifySubmittedGrantCoverage = async (params: {
  readonly scope: MigrationApprovalCleanupJournalScope
  readonly grantHash: Hex
  readonly receiptBlockNumber: bigint
  readonly publicClient: Pick<PublicClient, 'getTransaction'>
  readonly getCleanupTransaction: () => Promise<CleanupTransaction | null>
}): Promise<MigrationApprovalCleanupCoverage> => {
  const grantTransaction = await readCleanupTransaction({
    publicClient: params.publicClient,
    hash: params.grantHash,
  })
  if (!grantTransaction) return 'unknown'
  if (!addressesEqual(grantTransaction.from, params.scope.owner)) {
    return 'not-covered'
  }
  if (grantTransaction.blockNumber != null) {
    return grantTransaction.blockNumber <= params.receiptBlockNumber
      ? 'covered'
      : 'not-covered'
  }

  const cleanupTransaction = await params.getCleanupTransaction()
  if (!cleanupTransaction) return 'unknown'
  if (
    cleanupTransaction.blockNumber !== params.receiptBlockNumber ||
    !addressesEqual(cleanupTransaction.from, params.scope.owner) ||
    grantTransaction.nonce > cleanupTransaction.nonce
  ) {
    return 'not-covered'
  }
  return 'covered'
}

/**
 * Proves that a confirmed false-state observation is causally after every
 * submitted grant it is about to discharge. A receipt block alone is not
 * enough: another wallet/RPC can queue the grant at a higher EOA nonce and
 * mine the cleanup first.
 */
export const verifyMigrationApprovalCleanupCoverage = async (params: {
  readonly scope: MigrationApprovalCleanupJournalScope
  readonly attemptIds: readonly string[]
  readonly revocationHash: Hex
  readonly receiptBlockNumber: bigint
  readonly publicClient: Pick<PublicClient, 'getTransaction'>
}): Promise<MigrationApprovalCleanupCoverage> => {
  let cleanupTransactionPromise: Promise<CleanupTransaction | null> | undefined
  const getCleanupTransaction = () => {
    cleanupTransactionPromise ??= readCleanupTransaction({
      publicClient: params.publicClient,
      hash: params.revocationHash,
    })
    return cleanupTransactionPromise
  }

  for (const attemptId of params.attemptIds) {
    const obligation = loadMigrationApprovalCleanupAttempt(
      params.scope,
      attemptId,
    )
    // Revocations capture exact immutable v2/shadow attempt IDs. Absence can
    // be a racing storage read, never proof that this cleanup covered it.
    if (!obligation) return 'unknown'
    if (obligation.state === 'historical') continue
    if (obligation.state !== 'grant-submitted' || !obligation.grantHash) {
      return 'not-covered'
    }

    const coverage = await verifySubmittedGrantCoverage({
      scope: params.scope,
      grantHash: obligation.grantHash,
      receiptBlockNumber: params.receiptBlockNumber,
      publicClient: params.publicClient,
      getCleanupTransaction,
    })
    if (coverage !== 'covered') return coverage
  }

  return 'covered'
}

const reconcilePendingRevocations = async (params: {
  readonly eoa: Address
  readonly hcaAddress: Address
  readonly publicClient: CleanupReadClient
  readonly scope: MigrationApprovalCleanupJournalScope
}): Promise<void> => {
  const snapshot = loadMigrationApprovalCleanupJournal(params.scope)
  for (const revocation of snapshot.pendingRevocations) {
    try {
      const receipt = await params.publicClient.getTransactionReceipt({
        hash: revocation.hash,
      })
      if (receipt.status !== 'success') {
        recordMigrationApprovalCleanupRevocationFailed(
          params.scope,
          revocation.revocationId,
        )
        continue
      }

      const granted = await getGrantedMigrationCleanupApprovals({
        eoa: params.eoa,
        hcaAddress: params.hcaAddress,
        publicClient: params.publicClient,
        blockNumber: receipt.blockNumber,
      })
      if (granted.length > 0) {
        recordMigrationApprovalCleanupRevocationFailed(
          params.scope,
          revocation.revocationId,
        )
        continue
      }
      const coverage = await verifyMigrationApprovalCleanupCoverage({
        scope: params.scope,
        attemptIds: revocation.attemptIds,
        revocationHash: revocation.hash,
        receiptBlockNumber: receipt.blockNumber,
        publicClient: params.publicClient,
      })
      if (coverage !== 'covered') {
        if (coverage === 'not-covered') {
          recordMigrationApprovalCleanupRevocationFailed(
            params.scope,
            revocation.revocationId,
          )
        }
        continue
      }
      recordMigrationApprovalCleanupRevocationConfirmed(
        params.scope,
        revocation.revocationId,
        revocation.attemptIds,
      )
    } catch {
      // Receipt/state uncertainty keeps this exact revocation pending. The
      // recovery action remains retryable with a new idempotent false write.
    }
  }
}

const readDurableCleanupEvidence = async (params: {
  readonly eoa: Address
  readonly hcaAddress: Address
  readonly publicClient: CleanupReadClient
  readonly scope: MigrationApprovalCleanupJournalScope
}): Promise<DurableCleanupEvidence> => {
  try {
    await reconcilePendingRevocations(params)
    const snapshot = loadMigrationApprovalCleanupJournal(params.scope)
    return {
      exists: snapshot.obligations.length > 0,
      hasPendingPrompt: snapshot.obligations.some(
        ({ state }) => state === 'prompt-pending',
      ),
      ...(snapshot.pendingRevocations[0]
        ? { pendingRevocationHash: snapshot.pendingRevocations[0].hash }
        : {}),
    }
  } catch (cause) {
    if (
      cause instanceof MigrationApprovalCleanupJournalCorruptError ||
      cause instanceof MigrationApprovalCleanupJournalUnavailableError
    ) {
      // Corruption/storage denial can occur after a grant was submitted. A
      // false latest-state read cannot prove that earlier prompt cannot land.
      return { exists: true, hasPendingPrompt: true }
    }
    throw cause
  }
}

/**
 * Combines current chain state with per-attempt durable cleanup evidence.
 * Prompt markers are deliberately non-dischargeable until their wallet call
 * either rejects or returns a grant hash; a later confirmation can otherwise
 * re-enable approval after an earlier false transaction.
 */
export const readMigrationApprovalCleanupStatus = async (params: {
  readonly eoa: Address
  readonly hcaAddress: Address
  readonly chainId: number
  readonly publicClient: CleanupReadClient
}): Promise<MigrationApprovalCleanupStatus> => {
  const scope: MigrationApprovalCleanupJournalScope = {
    chainId: params.chainId,
    owner: params.eoa,
    hca: params.hcaAddress,
  }
  const fallbackApproval = migrationCleanupApprovalFor(params.hcaAddress)
  const durableEvidence = await readDurableCleanupEvidence({
    eoa: params.eoa,
    hcaAddress: params.hcaAddress,
    publicClient: params.publicClient,
    scope,
  })

  try {
    const granted = await getGrantedMigrationCleanupApprovals({
      eoa: params.eoa,
      hcaAddress: params.hcaAddress,
      publicClient: params.publicClient,
    })
    return {
      approvals:
        granted.length > 0 || durableEvidence.exists ? [fallbackApproval] : [],
      ...(durableEvidence.pendingRevocationHash
        ? { pendingRevocationHash: durableEvidence.pendingRevocationHash }
        : {}),
      ...(durableEvidence.hasPendingPrompt ? { hasPendingPrompt: true } : {}),
    }
  } catch (cause) {
    if (durableEvidence.exists) {
      return {
        approvals: [fallbackApproval],
        ...(durableEvidence.pendingRevocationHash
          ? { pendingRevocationHash: durableEvidence.pendingRevocationHash }
          : {}),
        ...(durableEvidence.hasPendingPrompt ? { hasPendingPrompt: true } : {}),
      }
    }
    throw cause
  }
}
