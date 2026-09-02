import type { Address, Hex, PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getMigrationApprovalCleanupStorageKey,
  loadMigrationApprovalCleanupJournal,
  MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
  recordMigrationApprovalCleanupGrantAttempt,
  recordMigrationApprovalCleanupGrantHash,
  recordMigrationApprovalCleanupGrantReplacement,
  recordMigrationApprovalCleanupRequired,
  recordMigrationApprovalCleanupRevocationHash,
} from './migrationApprovalCleanupJournal'
import { migrationCleanupApprovalFor } from './migrationApprovals'
import {
  readMigrationApprovalCleanupStatus,
  verifyMigrationApprovalCleanupCoverage,
} from './readMigrationApprovalCleanupStatus'

const OWNER = '0x0000000000000000000000000000000000000001' as Address
const HCA = '0x0000000000000000000000000000000000000002' as Address
const OTHER_HCA = '0x0000000000000000000000000000000000000003' as Address
const CHAIN_ID = 11155111
const GRANT_HASH = `0x${'1'.repeat(64)}` as Hex
const REVOCATION_HASH = `0x${'2'.repeat(64)}` as Hex
const ATTEMPT_1 = '00000000-0000-4000-8000-000000000001'
const ATTEMPT_2 = '00000000-0000-4000-8000-000000000002'
const REVOCATION_1 = '00000000-0000-4000-8000-000000000011'
const scope = { chainId: CHAIN_ID, owner: OWNER, hca: HCA }
const trustedCandidate = migrationCleanupApprovalFor(HCA)

const getTransactionReceipt = vi.fn()
const getTransaction = vi.fn()
const readContract = vi.fn()
const publicClient = {
  getTransaction,
  getTransactionReceipt,
  readContract,
} as unknown as Pick<
  PublicClient,
  'getTransaction' | 'getTransactionReceipt' | 'readContract'
>

const readStatus = () =>
  readMigrationApprovalCleanupStatus({
    eoa: OWNER,
    hcaAddress: HCA,
    chainId: CHAIN_ID,
    publicClient,
  })

const recordHistoricalAttempt = (attemptId = ATTEMPT_1) =>
  recordMigrationApprovalCleanupRequired(scope, localStorage, 123, attemptId)

const recordPendingRevocation = (attemptIds: readonly string[] = [ATTEMPT_1]) =>
  recordMigrationApprovalCleanupRevocationHash(
    scope,
    REVOCATION_1,
    attemptIds,
    REVOCATION_HASH,
    localStorage,
    124,
  )

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  readContract.mockResolvedValue(false)
  getTransaction.mockResolvedValue({
    from: OWNER,
    nonce: 1,
    blockNumber: 455n,
  })
})

describe('readMigrationApprovalCleanupStatus', () => {
  it('never treats a missing targeted attempt as covered', async () => {
    await expect(
      verifyMigrationApprovalCleanupCoverage({
        scope,
        attemptIds: [ATTEMPT_1],
        revocationHash: REVOCATION_HASH,
        receiptBlockNumber: 456n,
        publicClient,
      }),
    ).resolves.toBe('unknown')
    expect(getTransaction).not.toHaveBeenCalled()
  })

  it('returns empty when neither live nor durable cleanup evidence exists', async () => {
    await expect(readStatus()).resolves.toEqual({ approvals: [] })

    expect(readContract).toHaveBeenCalledOnce()
    expect(getTransactionReceipt).not.toHaveBeenCalled()
  })

  it('returns the trusted candidate when durable evidence outlives a false live read', async () => {
    recordHistoricalAttempt()

    await expect(readStatus()).resolves.toEqual({
      approvals: [trustedCandidate],
    })
    expect(loadMigrationApprovalCleanupJournal(scope).obligations).toHaveLength(
      1,
    )
  })

  it('returns the trusted candidate when durable evidence outlives a live read error', async () => {
    recordHistoricalAttempt()
    readContract.mockRejectedValueOnce(new Error('rpc unavailable'))

    await expect(readStatus()).resolves.toEqual({
      approvals: [trustedCandidate],
    })
  })

  it('keeps the exact revocation pending while its receipt is unavailable', async () => {
    recordHistoricalAttempt()
    recordPendingRevocation()
    getTransactionReceipt.mockRejectedValueOnce(
      new Error('receipt unavailable'),
    )

    await expect(readStatus()).resolves.toEqual({
      approvals: [trustedCandidate],
      pendingRevocationHash: REVOCATION_HASH,
    })
    expect(
      loadMigrationApprovalCleanupJournal(scope).pendingRevocations,
    ).toEqual([
      {
        revocationId: REVOCATION_1,
        attemptIds: [ATTEMPT_1],
        hash: REVOCATION_HASH,
      },
    ])
    expect(readContract).toHaveBeenCalledOnce()
  })

  it('discharges only the exact attempts covered by a successful revocation verified false', async () => {
    recordHistoricalAttempt(ATTEMPT_1)
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      125,
      ATTEMPT_2,
    )
    recordMigrationApprovalCleanupGrantHash(
      scope,
      ATTEMPT_2,
      GRANT_HASH,
      localStorage,
    )
    recordPendingRevocation([ATTEMPT_1])
    getTransactionReceipt.mockResolvedValueOnce({
      status: 'success',
      blockNumber: 456n,
    })

    await expect(readStatus()).resolves.toEqual({
      approvals: [trustedCandidate],
    })
    expect(loadMigrationApprovalCleanupJournal(scope)).toMatchObject({
      obligations: [
        expect.objectContaining({
          attemptId: ATTEMPT_2,
          state: 'grant-submitted',
        }),
      ],
      pendingRevocations: [],
    })
    expect(readContract.mock.calls[0]?.[0]).toHaveProperty('blockNumber', 456n)
    expect(readContract.mock.calls[1]?.[0]).not.toHaveProperty('blockNumber')
  })

  it('clears all exact durable evidence after a successful revocation verified false', async () => {
    recordHistoricalAttempt()
    recordPendingRevocation()
    getTransactionReceipt.mockResolvedValueOnce({
      status: 'success',
      blockNumber: 456n,
    })

    await expect(readStatus()).resolves.toEqual({ approvals: [] })
    expect(loadMigrationApprovalCleanupJournal(scope)).toEqual({
      obligations: [],
      pendingRevocations: [],
    })
  })

  it('retains debt when a higher-nonce grant can still land after the cleanup', async () => {
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      123,
      ATTEMPT_1,
    )
    recordMigrationApprovalCleanupGrantHash(
      scope,
      ATTEMPT_1,
      GRANT_HASH,
      localStorage,
    )
    recordPendingRevocation()
    getTransactionReceipt.mockResolvedValueOnce({
      status: 'success',
      blockNumber: 456n,
    })
    getTransaction.mockImplementation(({ hash }: { hash: Hex }) =>
      Promise.resolve(
        hash === GRANT_HASH
          ? { from: OWNER, nonce: 12, blockNumber: null }
          : { from: OWNER, nonce: 11, blockNumber: 456n },
      ),
    )

    await expect(readStatus()).resolves.toEqual({
      approvals: [trustedCandidate],
    })
    expect(loadMigrationApprovalCleanupJournal(scope)).toMatchObject({
      obligations: [expect.objectContaining({ attemptId: ATTEMPT_1 })],
      pendingRevocations: [],
    })
  })

  it('discharges a pending grant when the cleanup has the same or higher owner nonce', async () => {
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      123,
      ATTEMPT_1,
    )
    recordMigrationApprovalCleanupGrantHash(
      scope,
      ATTEMPT_1,
      GRANT_HASH,
      localStorage,
    )
    recordPendingRevocation()
    getTransactionReceipt.mockResolvedValueOnce({
      status: 'success',
      blockNumber: 456n,
    })
    getTransaction.mockImplementation(({ hash }: { hash: Hex }) =>
      Promise.resolve(
        hash === GRANT_HASH
          ? { from: OWNER, nonce: 12, blockNumber: null }
          : { from: OWNER, nonce: 12, blockNumber: 456n },
      ),
    )

    await expect(readStatus()).resolves.toEqual({ approvals: [] })
    expect(loadMigrationApprovalCleanupJournal(scope).obligations).toEqual([])
  })

  it('keeps the revocation pending while grant ordering cannot be read', async () => {
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      123,
      ATTEMPT_1,
    )
    recordMigrationApprovalCleanupGrantHash(
      scope,
      ATTEMPT_1,
      GRANT_HASH,
      localStorage,
    )
    recordPendingRevocation()
    getTransactionReceipt.mockResolvedValueOnce({
      status: 'success',
      blockNumber: 456n,
    })
    getTransaction.mockRejectedValueOnce(new Error('transaction unavailable'))

    await expect(readStatus()).resolves.toEqual({
      approvals: [trustedCandidate],
      pendingRevocationHash: REVOCATION_HASH,
    })
    expect(
      loadMigrationApprovalCleanupJournal(scope).pendingRevocations,
    ).toHaveLength(1)
  })

  it('retries a shifting cross-tab storage enumeration before checking cleanup ordering', async () => {
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      123,
      ATTEMPT_1,
    )
    recordMigrationApprovalCleanupGrantHash(
      scope,
      ATTEMPT_1,
      GRANT_HASH,
      localStorage,
    )
    recordPendingRevocation()
    getTransactionReceipt.mockResolvedValueOnce({
      status: 'success',
      blockNumber: 456n,
    })
    getTransaction.mockImplementation(({ hash }: { hash: Hex }) =>
      Promise.resolve(
        hash === GRANT_HASH
          ? { from: OWNER, nonce: 12, blockNumber: null }
          : { from: OWNER, nonce: 11, blockNumber: 456n },
      ),
    )

    const originalKey = localStorage.key.bind(localStorage)
    let keyReads = 0
    const keySpy = vi.spyOn(localStorage, 'key').mockImplementation((index) => {
      keyReads += 1
      // Simulate an insertion shifting the first scan so it observes one key
      // twice and would otherwise omit the submitted grant attempt.
      if (keyReads === 2) return originalKey(0)
      return originalKey(index)
    })
    try {
      await expect(readStatus()).resolves.toEqual({
        approvals: [trustedCandidate],
      })
    } finally {
      keySpy.mockRestore()
    }

    expect(loadMigrationApprovalCleanupJournal(scope)).toMatchObject({
      obligations: [expect.objectContaining({ attemptId: ATTEMPT_1 })],
      pendingRevocations: [],
    })
  })

  it('discharges a grant already mined before the cleanup receipt block', async () => {
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      123,
      ATTEMPT_1,
    )
    recordMigrationApprovalCleanupGrantHash(
      scope,
      ATTEMPT_1,
      GRANT_HASH,
      localStorage,
    )
    recordPendingRevocation()
    getTransactionReceipt.mockResolvedValueOnce({
      status: 'success',
      blockNumber: 456n,
    })

    await expect(readStatus()).resolves.toEqual({ approvals: [] })
    expect(getTransaction).toHaveBeenCalledOnce()
    expect(getTransaction).toHaveBeenCalledWith({ hash: GRANT_HASH })
  })

  it('uses a receipt-proven replacement when the dropped grant hash is no longer queryable', async () => {
    const replacementHash = `0x${'3'.repeat(64)}` as Hex
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      123,
      ATTEMPT_1,
    )
    recordMigrationApprovalCleanupGrantHash(
      scope,
      ATTEMPT_1,
      GRANT_HASH,
      localStorage,
    )
    recordMigrationApprovalCleanupGrantReplacement(
      scope,
      ATTEMPT_1,
      GRANT_HASH,
      replacementHash,
      localStorage,
      124,
    )
    recordPendingRevocation()
    getTransactionReceipt.mockResolvedValueOnce({
      status: 'success',
      blockNumber: 456n,
    })
    getTransaction.mockImplementation(({ hash }: { hash: Hex }) => {
      if (hash === GRANT_HASH) {
        return Promise.reject(new Error('dropped transaction unavailable'))
      }
      return Promise.resolve({ from: OWNER, nonce: 12, blockNumber: 455n })
    })

    await expect(readStatus()).resolves.toEqual({ approvals: [] })
    expect(getTransaction).toHaveBeenCalledOnce()
    expect(getTransaction).toHaveBeenCalledWith({ hash: replacementHash })
    expect(loadMigrationApprovalCleanupJournal(scope).obligations).toEqual([])
  })

  it('resolves a reverted revocation but retains its cleanup evidence', async () => {
    recordHistoricalAttempt()
    recordPendingRevocation()
    getTransactionReceipt.mockResolvedValueOnce({ status: 'reverted' })

    await expect(readStatus()).resolves.toEqual({
      approvals: [trustedCandidate],
    })
    expect(loadMigrationApprovalCleanupJournal(scope)).toMatchObject({
      obligations: [expect.objectContaining({ attemptId: ATTEMPT_1 })],
      pendingRevocations: [],
    })
  })

  it('resolves a successful revocation that is still true on-chain but retains its cleanup evidence', async () => {
    recordHistoricalAttempt()
    recordPendingRevocation()
    getTransactionReceipt.mockResolvedValueOnce({
      status: 'success',
      blockNumber: 456n,
    })
    readContract.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await expect(readStatus()).resolves.toEqual({
      approvals: [trustedCandidate],
    })
    expect(loadMigrationApprovalCleanupJournal(scope)).toMatchObject({
      obligations: [expect.objectContaining({ attemptId: ATTEMPT_1 })],
      pendingRevocations: [],
    })
    expect(readContract.mock.calls[0]?.[0]).toHaveProperty('blockNumber', 456n)
  })

  it('keeps a revocation pending when its receipt-block state is uncertain', async () => {
    recordHistoricalAttempt()
    recordPendingRevocation()
    getTransactionReceipt.mockResolvedValueOnce({
      status: 'success',
      blockNumber: 456n,
    })
    readContract
      .mockRejectedValueOnce(new Error('receipt block unavailable'))
      .mockResolvedValueOnce(false)

    await expect(readStatus()).resolves.toEqual({
      approvals: [trustedCandidate],
      pendingRevocationHash: REVOCATION_HASH,
    })
    expect(
      loadMigrationApprovalCleanupJournal(scope).pendingRevocations,
    ).toHaveLength(1)
  })

  it('retains an unresolved prompt through earlier cleanup and recognises its late grant', async () => {
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      123,
      ATTEMPT_1,
    )
    recordHistoricalAttempt(ATTEMPT_2)
    recordPendingRevocation([ATTEMPT_2])
    getTransactionReceipt.mockResolvedValueOnce({
      status: 'success',
      blockNumber: 456n,
    })

    await expect(readStatus()).resolves.toEqual({
      approvals: [trustedCandidate],
      hasPendingPrompt: true,
    })
    expect(loadMigrationApprovalCleanupJournal(scope).obligations).toEqual([
      expect.objectContaining({
        attemptId: ATTEMPT_1,
        state: 'prompt-pending',
      }),
    ])

    recordMigrationApprovalCleanupGrantHash(
      scope,
      ATTEMPT_1,
      GRANT_HASH,
      localStorage,
    )

    await expect(readStatus()).resolves.toEqual({
      approvals: [trustedCandidate],
    })
    expect(loadMigrationApprovalCleanupJournal(scope).obligations).toEqual([
      expect.objectContaining({
        attemptId: ATTEMPT_1,
        state: 'grant-submitted',
        grantHash: GRANT_HASH,
      }),
    ])
  })

  it('returns the trusted candidate and prompt warning when storage becomes unavailable', async () => {
    recordHistoricalAttempt()
    const storageSpy = vi
      .spyOn(localStorage, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage denied')
      })

    try {
      await expect(readStatus()).resolves.toEqual({
        approvals: [trustedCandidate],
        hasPendingPrompt: true,
      })
    } finally {
      storageSpy.mockRestore()
    }
  })

  it('returns the trusted candidate and prompt warning for a corrupt record in the requested scope', async () => {
    localStorage.setItem(
      getMigrationApprovalCleanupStorageKey(scope),
      JSON.stringify({
        version: 1,
        scope: { ...scope, hca: OTHER_HCA },
        approvalId: MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
        createdAt: 123,
      }),
    )

    await expect(readStatus()).resolves.toEqual({
      approvals: [trustedCandidate],
      hasPendingPrompt: true,
    })
  })
})
