import type { Address, Hex, PublicClient } from 'viem'
import {
  clearMigrationApprovalCleanupRevocationHash,
  loadMigrationApprovalCleanupObligation,
  MigrationApprovalCleanupJournalCorruptError,
  type MigrationApprovalCleanupJournalScope,
  MigrationApprovalCleanupJournalUnavailableError,
  removeMigrationApprovalCleanupObligation,
} from './migrationApprovalCleanupJournal'
import {
  getGrantedMigrationCleanupApprovals,
  type MigrationCleanupApproval,
  migrationCleanupApprovalFor,
} from './migrationApprovals'

export type MigrationApprovalCleanupStatus = {
  readonly approvals: readonly MigrationCleanupApproval[]
  readonly pendingRevocationHash?: Hex
}

type CleanupReadClient = Pick<
  PublicClient,
  'getTransactionReceipt' | 'readContract'
>

type DurableCleanupEvidence = {
  readonly exists: boolean
  readonly pendingRevocationHash?: Hex
}

const tryClearRevocationHash = (
  scope: MigrationApprovalCleanupJournalScope,
): void => {
  try {
    clearMigrationApprovalCleanupRevocationHash(scope)
  } catch {
    // Chain state remains authoritative. A later read can retry journal repair.
  }
}

const tryRemoveObligation = (
  scope: MigrationApprovalCleanupJournalScope,
): void => {
  try {
    removeMigrationApprovalCleanupObligation(scope)
  } catch {
    // The confirmed revocation made the account safe even if storage cleanup
    // is unavailable. A later read can retry removing the stale marker.
  }
}

const readDurableCleanupEvidence = (
  scope: MigrationApprovalCleanupJournalScope,
): DurableCleanupEvidence => {
  try {
    const obligation = loadMigrationApprovalCleanupObligation(scope)
    return {
      exists: obligation !== null,
      ...(obligation?.revocationHash
        ? { pendingRevocationHash: obligation.revocationHash }
        : {}),
    }
  } catch (cause) {
    if (cause instanceof MigrationApprovalCleanupJournalCorruptError) {
      // A scope-specific record exists but cannot be trusted. Fail safely by
      // offering the one trusted, deployment-derived revocation target.
      return { exists: true }
    }
    if (cause instanceof MigrationApprovalCleanupJournalUnavailableError) {
      return { exists: false }
    }
    throw cause
  }
}

const reconcilePendingRevocation = async (params: {
  readonly eoa: Address
  readonly hcaAddress: Address
  readonly publicClient: CleanupReadClient
  readonly scope: MigrationApprovalCleanupJournalScope
  readonly hash: Hex
}): Promise<MigrationApprovalCleanupStatus | null> => {
  const fallbackApproval = migrationCleanupApprovalFor(params.hcaAddress)
  try {
    const receipt = await params.publicClient.getTransactionReceipt({
      hash: params.hash,
    })
    if (receipt.status !== 'success') {
      tryClearRevocationHash(params.scope)
      return null
    }

    const granted = await getGrantedMigrationCleanupApprovals({
      eoa: params.eoa,
      hcaAddress: params.hcaAddress,
      publicClient: params.publicClient,
    })
    if (granted.length > 0) {
      tryClearRevocationHash(params.scope)
      return { approvals: [fallbackApproval] }
    }
    tryRemoveObligation(params.scope)
    return { approvals: [] }
  } catch {
    return {
      approvals: [fallbackApproval],
      pendingRevocationHash: params.hash,
    }
  }
}

/**
 * Combines current chain state with the durable cleanup obligation.
 *
 * The obligation deliberately wins over a `false` latest-state read: a grant
 * transaction may already have been submitted at the preceding EOA nonce but
 * not be visible to this RPC yet. A later revocation is safe and idempotent.
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
  const durableEvidence = readDurableCleanupEvidence(scope)

  if (durableEvidence.pendingRevocationHash) {
    const reconciled = await reconcilePendingRevocation({
      eoa: params.eoa,
      hcaAddress: params.hcaAddress,
      publicClient: params.publicClient,
      scope,
      hash: durableEvidence.pendingRevocationHash,
    })
    if (reconciled) return reconciled
  }

  try {
    const granted = await getGrantedMigrationCleanupApprovals({
      eoa: params.eoa,
      hcaAddress: params.hcaAddress,
      publicClient: params.publicClient,
    })
    return {
      approvals:
        granted.length > 0 || durableEvidence.exists ? [fallbackApproval] : [],
    }
  } catch (cause) {
    if (durableEvidence.exists) return { approvals: [fallbackApproval] }
    throw cause
  }
}
