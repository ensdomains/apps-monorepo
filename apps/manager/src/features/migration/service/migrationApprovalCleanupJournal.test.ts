import type { Address, Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearMigrationApprovalCleanupRevocationHash,
  getMigrationApprovalCleanupJournalRevision,
  getMigrationApprovalCleanupStorageKey,
  loadMigrationApprovalCleanupObligation,
  MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
  MIGRATION_APPROVAL_CLEANUP_STORAGE_KEY_PREFIX,
  MigrationApprovalCleanupJournalCorruptError,
  type MigrationApprovalCleanupJournalStorage,
  MigrationApprovalCleanupJournalUnavailableError,
  MigrationApprovalCleanupJournalValidationError,
  recordMigrationApprovalCleanupGrantHash,
  recordMigrationApprovalCleanupRequired,
  recordMigrationApprovalCleanupRevocationHash,
  removeMigrationApprovalCleanupObligation,
  subscribeMigrationApprovalCleanupJournal,
} from './migrationApprovalCleanupJournal'

const OWNER = '0x0000000000000000000000000000000000000001' as Address
const HCA = '0x0000000000000000000000000000000000000002' as Address
const OTHER_HCA = '0x0000000000000000000000000000000000000003' as Address
const OTHER_OWNER = '0x0000000000000000000000000000000000000004' as Address
const CHAIN_ID = 11155111
const GRANT_HASH = `0x${'1'.repeat(64)}` as Hex
const REVOCATION_HASH = `0x${'2'.repeat(64)}` as Hex
const scope = { chainId: CHAIN_ID, owner: OWNER, hca: HCA }

const validStoredObligation = () => ({
  version: 1,
  scope,
  approvalId: MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
  createdAt: 123,
})

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('migration approval cleanup journal', () => {
  it('persists the full grant-to-revocation lifecycle', () => {
    expect(loadMigrationApprovalCleanupObligation(scope)).toBeNull()

    expect(
      recordMigrationApprovalCleanupRequired(scope, localStorage, 123),
    ).toEqual(validStoredObligation())
    expect(loadMigrationApprovalCleanupObligation(scope)).toEqual(
      validStoredObligation(),
    )

    expect(recordMigrationApprovalCleanupGrantHash(scope, GRANT_HASH)).toEqual({
      ...validStoredObligation(),
      grantHash: GRANT_HASH,
    })
    expect(
      recordMigrationApprovalCleanupRevocationHash(scope, REVOCATION_HASH),
    ).toEqual({
      ...validStoredObligation(),
      grantHash: GRANT_HASH,
      revocationHash: REVOCATION_HASH,
    })
    expect(clearMigrationApprovalCleanupRevocationHash(scope)).toEqual({
      ...validStoredObligation(),
      grantHash: GRANT_HASH,
    })

    removeMigrationApprovalCleanupObligation(scope)

    expect(loadMigrationApprovalCleanupObligation(scope)).toBeNull()
    expect(
      localStorage.getItem(getMigrationApprovalCleanupStorageKey(scope)),
    ).toBeNull()
  })

  it('preserves an existing obligation when the required step is retried', () => {
    recordMigrationApprovalCleanupRequired(scope, localStorage, 123)
    recordMigrationApprovalCleanupGrantHash(scope, GRANT_HASH)

    expect(
      recordMigrationApprovalCleanupRequired(scope, localStorage, 999),
    ).toEqual({
      ...validStoredObligation(),
      grantHash: GRANT_HASH,
    })
  })

  it('isolates obligations by chain, owner, and HCA storage key', () => {
    const otherHcaScope = { ...scope, hca: OTHER_HCA }
    const otherOwnerScope = { ...scope, owner: OTHER_OWNER }
    const otherChainScope = { ...scope, chainId: 1 }

    recordMigrationApprovalCleanupRequired(scope, localStorage, 100)
    recordMigrationApprovalCleanupRequired(otherHcaScope, localStorage, 200)
    recordMigrationApprovalCleanupRequired(otherOwnerScope, localStorage, 300)
    recordMigrationApprovalCleanupRequired(otherChainScope, localStorage, 400)

    const keys = [
      getMigrationApprovalCleanupStorageKey(scope),
      getMigrationApprovalCleanupStorageKey(otherHcaScope),
      getMigrationApprovalCleanupStorageKey(otherOwnerScope),
      getMigrationApprovalCleanupStorageKey(otherChainScope),
    ]
    expect(new Set(keys)).toHaveLength(4)
    expect(
      keys.every((key) =>
        key.startsWith(MIGRATION_APPROVAL_CLEANUP_STORAGE_KEY_PREFIX),
      ),
    ).toBe(true)
    expect(loadMigrationApprovalCleanupObligation(scope)?.createdAt).toBe(100)
    expect(
      loadMigrationApprovalCleanupObligation(otherHcaScope)?.createdAt,
    ).toBe(200)
    expect(
      loadMigrationApprovalCleanupObligation(otherOwnerScope)?.createdAt,
    ).toBe(300)
    expect(
      loadMigrationApprovalCleanupObligation(otherChainScope)?.createdAt,
    ).toBe(400)

    removeMigrationApprovalCleanupObligation(scope)

    expect(loadMigrationApprovalCleanupObligation(scope)).toBeNull()
    expect(loadMigrationApprovalCleanupObligation(otherHcaScope)).not.toBeNull()
    expect(
      loadMigrationApprovalCleanupObligation(otherOwnerScope),
    ).not.toBeNull()
    expect(
      loadMigrationApprovalCleanupObligation(otherChainScope),
    ).not.toBeNull()
  })

  it.each([
    ['invalid JSON', '{bad json'],
    [
      'an unsupported version',
      JSON.stringify({ ...validStoredObligation(), version: 2 }),
    ],
    [
      'an unexpected field',
      JSON.stringify({ ...validStoredObligation(), unexpected: true }),
    ],
    [
      'a different approval',
      JSON.stringify({
        ...validStoredObligation(),
        approvalId: 'base-registrar:hca-token',
      }),
    ],
    [
      'a scope that does not match its key',
      JSON.stringify({
        ...validStoredObligation(),
        scope: { ...scope, hca: OTHER_HCA },
      }),
    ],
    [
      'an invalid transaction hash',
      JSON.stringify({ ...validStoredObligation(), grantHash: '0x1234' }),
    ],
    [
      'an invalid creation timestamp',
      JSON.stringify({ ...validStoredObligation(), createdAt: -1 }),
    ],
  ])('fails closed when storage contains %s', (_description, stored) => {
    localStorage.setItem(getMigrationApprovalCleanupStorageKey(scope), stored)

    expect(() => loadMigrationApprovalCleanupObligation(scope)).toThrow(
      MigrationApprovalCleanupJournalCorruptError,
    )
  })

  it('fails closed when storage is missing or throws while reading', () => {
    expect(() => loadMigrationApprovalCleanupObligation(scope, null)).toThrow(
      MigrationApprovalCleanupJournalUnavailableError,
    )

    const unavailableStorage: MigrationApprovalCleanupJournalStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    }
    expect(() =>
      loadMigrationApprovalCleanupObligation(scope, unavailableStorage),
    ).toThrow(MigrationApprovalCleanupJournalUnavailableError)
  })

  it('validates chain, addresses, hashes, and timestamps', () => {
    const storage: MigrationApprovalCleanupJournalStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }

    expect(() =>
      loadMigrationApprovalCleanupObligation({ ...scope, chainId: 0 }, storage),
    ).toThrow(MigrationApprovalCleanupJournalValidationError)
    expect(() =>
      loadMigrationApprovalCleanupObligation(
        { ...scope, owner: '0x1234' as Address },
        storage,
      ),
    ).toThrow(MigrationApprovalCleanupJournalValidationError)
    expect(() =>
      recordMigrationApprovalCleanupGrantHash(scope, '0x1234' as Hex, storage),
    ).toThrow(MigrationApprovalCleanupJournalValidationError)
    expect(() =>
      recordMigrationApprovalCleanupRequired(scope, storage, -1),
    ).toThrow(MigrationApprovalCleanupJournalValidationError)
    expect(storage.getItem).not.toHaveBeenCalled()
  })

  it('fails closed and does not notify when a write throws or is corrupted', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeMigrationApprovalCleanupJournal(listener)
    const initialRevision = getMigrationApprovalCleanupJournalRevision()
    const throwingStorage: MigrationApprovalCleanupJournalStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => undefined,
    }

    expect(() =>
      recordMigrationApprovalCleanupRequired(scope, throwingStorage, 123),
    ).toThrow(MigrationApprovalCleanupJournalUnavailableError)
    expect(getMigrationApprovalCleanupJournalRevision()).toBe(initialRevision)
    expect(listener).not.toHaveBeenCalled()

    let stored: string | null = null
    const corruptingStorage: MigrationApprovalCleanupJournalStorage = {
      getItem: () => stored,
      setItem: () => {
        stored = '{bad json'
      },
      removeItem: () => {
        stored = null
      },
    }
    expect(() =>
      recordMigrationApprovalCleanupRequired(scope, corruptingStorage, 123),
    ).toThrow(MigrationApprovalCleanupJournalCorruptError)
    expect(getMigrationApprovalCleanupJournalRevision()).toBe(initialRevision)
    expect(listener).not.toHaveBeenCalled()

    unsubscribe()
  })

  it('fails closed when a removal cannot be persisted', () => {
    let stored: string | null = null
    const storage: MigrationApprovalCleanupJournalStorage = {
      getItem: () => stored,
      setItem: (_key, value) => {
        stored = value
      },
      removeItem: () => undefined,
    }
    recordMigrationApprovalCleanupRequired(scope, storage, 123)
    const revisionBeforeRemoval = getMigrationApprovalCleanupJournalRevision()

    expect(() =>
      removeMigrationApprovalCleanupObligation(scope, storage),
    ).toThrow(MigrationApprovalCleanupJournalCorruptError)
    expect(getMigrationApprovalCleanupJournalRevision()).toBe(
      revisionBeforeRemoval,
    )
  })

  it('can remove a corrupt record after revocation is independently confirmed', () => {
    const key = getMigrationApprovalCleanupStorageKey(scope)
    localStorage.setItem(key, '{bad json')
    expect(() => loadMigrationApprovalCleanupObligation(scope)).toThrow(
      MigrationApprovalCleanupJournalCorruptError,
    )

    expect(() => removeMigrationApprovalCleanupObligation(scope)).not.toThrow()
    expect(localStorage.getItem(key)).toBeNull()
  })

  it('publishes durable local changes and matching cross-tab storage events', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeMigrationApprovalCleanupJournal(listener)
    const initialRevision = getMigrationApprovalCleanupJournalRevision()

    recordMigrationApprovalCleanupRequired(scope, localStorage, 123)
    expect(getMigrationApprovalCleanupJournalRevision()).toBe(
      initialRevision + 1,
    )
    expect(listener).toHaveBeenCalledTimes(1)

    window.dispatchEvent(
      new StorageEvent('storage', { key: 'unrelated-storage-key' }),
    )
    expect(getMigrationApprovalCleanupJournalRevision()).toBe(
      initialRevision + 1,
    )
    expect(listener).toHaveBeenCalledTimes(1)

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: getMigrationApprovalCleanupStorageKey(scope),
      }),
    )
    expect(getMigrationApprovalCleanupJournalRevision()).toBe(
      initialRevision + 2,
    )
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    recordMigrationApprovalCleanupGrantHash(scope, GRANT_HASH)
    expect(getMigrationApprovalCleanupJournalRevision()).toBe(
      initialRevision + 3,
    )
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
