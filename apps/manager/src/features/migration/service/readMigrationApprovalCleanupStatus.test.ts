import type { Address, Hex, PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getMigrationApprovalCleanupStorageKey,
  loadMigrationApprovalCleanupObligation,
  MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
  recordMigrationApprovalCleanupRequired,
  recordMigrationApprovalCleanupRevocationHash,
} from './migrationApprovalCleanupJournal'
import { migrationCleanupApprovalFor } from './migrationApprovals'
import { readMigrationApprovalCleanupStatus } from './readMigrationApprovalCleanupStatus'

const OWNER = '0x0000000000000000000000000000000000000001' as Address
const HCA = '0x0000000000000000000000000000000000000002' as Address
const OTHER_HCA = '0x0000000000000000000000000000000000000003' as Address
const CHAIN_ID = 11155111
const REVOCATION_HASH = `0x${'2'.repeat(64)}` as Hex
const scope = { chainId: CHAIN_ID, owner: OWNER, hca: HCA }
const trustedCandidate = migrationCleanupApprovalFor(HCA)

const getTransactionReceipt = vi.fn()
const readContract = vi.fn()
const publicClient = {
  getTransactionReceipt,
  readContract,
} as unknown as Pick<PublicClient, 'getTransactionReceipt' | 'readContract'>

const readStatus = () =>
  readMigrationApprovalCleanupStatus({
    eoa: OWNER,
    hcaAddress: HCA,
    chainId: CHAIN_ID,
    publicClient,
  })

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  readContract.mockResolvedValue(false)
})

describe('readMigrationApprovalCleanupStatus', () => {
  it('returns empty when neither live nor durable cleanup evidence exists', async () => {
    await expect(readStatus()).resolves.toEqual({ approvals: [] })

    expect(readContract).toHaveBeenCalledOnce()
    expect(getTransactionReceipt).not.toHaveBeenCalled()
  })

  it('returns the trusted candidate when a durable obligation outlives a false live read', async () => {
    recordMigrationApprovalCleanupRequired(scope, localStorage, 123)

    await expect(readStatus()).resolves.toEqual({
      approvals: [trustedCandidate],
    })
    expect(loadMigrationApprovalCleanupObligation(scope)).not.toBeNull()
  })

  it('returns the trusted candidate when a durable obligation outlives a live read error', async () => {
    recordMigrationApprovalCleanupRequired(scope, localStorage, 123)
    readContract.mockRejectedValueOnce(new Error('rpc unavailable'))

    await expect(readStatus()).resolves.toEqual({
      approvals: [trustedCandidate],
    })
  })

  it('keeps the pending hash and trusted candidate while the revocation receipt is unavailable', async () => {
    recordMigrationApprovalCleanupRequired(scope, localStorage, 123)
    recordMigrationApprovalCleanupRevocationHash(scope, REVOCATION_HASH)
    getTransactionReceipt.mockRejectedValueOnce(
      new Error('receipt unavailable'),
    )

    await expect(readStatus()).resolves.toEqual({
      approvals: [trustedCandidate],
      pendingRevocationHash: REVOCATION_HASH,
    })
    expect(loadMigrationApprovalCleanupObligation(scope)?.revocationHash).toBe(
      REVOCATION_HASH,
    )
    expect(readContract).not.toHaveBeenCalled()
  })

  it('clears the durable obligation after a successful revocation and false live read', async () => {
    recordMigrationApprovalCleanupRequired(scope, localStorage, 123)
    recordMigrationApprovalCleanupRevocationHash(scope, REVOCATION_HASH)
    getTransactionReceipt.mockResolvedValueOnce({ status: 'success' })

    await expect(readStatus()).resolves.toEqual({ approvals: [] })
    expect(loadMigrationApprovalCleanupObligation(scope)).toBeNull()
  })

  it('clears a reverted revocation hash but retains the obligation and trusted candidate', async () => {
    recordMigrationApprovalCleanupRequired(scope, localStorage, 123)
    recordMigrationApprovalCleanupRevocationHash(scope, REVOCATION_HASH)
    getTransactionReceipt.mockResolvedValueOnce({ status: 'reverted' })

    await expect(readStatus()).resolves.toEqual({
      approvals: [trustedCandidate],
    })
    const obligation = loadMigrationApprovalCleanupObligation(scope)
    expect(obligation).not.toBeNull()
    expect(obligation?.revocationHash).toBeUndefined()
  })

  it('returns the trusted candidate for a corrupt record in the requested scope', async () => {
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
    })
  })
})
