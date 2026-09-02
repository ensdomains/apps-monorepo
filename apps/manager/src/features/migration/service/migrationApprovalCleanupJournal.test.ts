import type { Address, Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getMigrationApprovalCleanupJournalRevision,
  getMigrationApprovalCleanupStorageKey,
  loadMigrationApprovalCleanupJournal,
  loadMigrationApprovalCleanupObligation,
  MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
  MIGRATION_APPROVAL_CLEANUP_STORAGE_KEY_PREFIX,
  MigrationApprovalCleanupJournalCorruptError,
  type MigrationApprovalCleanupJournalStorage,
  MigrationApprovalCleanupJournalUnavailableError,
  MigrationApprovalCleanupJournalValidationError,
  recordMigrationApprovalCleanupGrantAttempt,
  recordMigrationApprovalCleanupGrantHash,
  recordMigrationApprovalCleanupGrantReplacement,
  recordMigrationApprovalCleanupPromptRejected,
  recordMigrationApprovalCleanupRequired,
  recordMigrationApprovalCleanupRevocationConfirmed,
  recordMigrationApprovalCleanupRevocationFailed,
  recordMigrationApprovalCleanupRevocationHash,
  subscribeMigrationApprovalCleanupJournal,
} from './migrationApprovalCleanupJournal'

const OWNER = '0x0000000000000000000000000000000000000001' as Address
const HCA = '0x0000000000000000000000000000000000000002' as Address
const OTHER_HCA = '0x0000000000000000000000000000000000000003' as Address
const CHAIN_ID = 11155111
const GRANT_HASH = `0x${'1'.repeat(64)}` as Hex
const REPLACEMENT_GRANT_HASH = `0x${'3'.repeat(64)}` as Hex
const REVOCATION_HASH = `0x${'2'.repeat(64)}` as Hex
const REPLACEMENT_REVOCATION_HASH = `0x${'4'.repeat(64)}` as Hex
const ATTEMPT_1 = '00000000-0000-4000-8000-000000000001'
const ATTEMPT_2 = '00000000-0000-4000-8000-000000000002'
const REVOCATION_1 = '00000000-0000-4000-8000-000000000011'
const scope = { chainId: CHAIN_ID, owner: OWNER, hca: HCA }

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('migration approval cleanup journal', () => {
  it('persists and discharges historical cleanup evidence', () => {
    const obligation = recordMigrationApprovalCleanupRequired(
      scope,
      localStorage,
      123,
      ATTEMPT_1,
    )
    expect(obligation).toMatchObject({
      version: 2,
      approvalId: MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
      attemptId: ATTEMPT_1,
      state: 'historical',
      createdAt: 123,
    })

    recordMigrationApprovalCleanupRevocationHash(
      scope,
      REVOCATION_1,
      [ATTEMPT_1],
      REVOCATION_HASH,
      localStorage,
      124,
    )
    expect(
      loadMigrationApprovalCleanupJournal(scope).pendingRevocations,
    ).toEqual([
      {
        revocationId: REVOCATION_1,
        attemptIds: [ATTEMPT_1],
        hash: REVOCATION_HASH,
      },
    ])

    recordMigrationApprovalCleanupRevocationConfirmed(
      scope,
      REVOCATION_1,
      [ATTEMPT_1],
      localStorage,
      125,
    )
    expect(loadMigrationApprovalCleanupJournal(scope)).toEqual({
      obligations: [],
      pendingRevocations: [],
    })
  })

  it('never discharges an unresolved wallet prompt with a false revocation', () => {
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      123,
      ATTEMPT_1,
    )
    const historical = recordMigrationApprovalCleanupRequired(
      scope,
      localStorage,
      124,
      ATTEMPT_2,
    )
    recordMigrationApprovalCleanupRevocationHash(
      scope,
      REVOCATION_1,
      [historical.attemptId],
      REVOCATION_HASH,
    )
    recordMigrationApprovalCleanupRevocationConfirmed(scope, REVOCATION_1, [
      historical.attemptId,
    ])

    expect(loadMigrationApprovalCleanupJournal(scope).obligations).toEqual([
      expect.objectContaining({
        attemptId: ATTEMPT_1,
        state: 'prompt-pending',
      }),
    ])

    recordMigrationApprovalCleanupGrantHash(scope, ATTEMPT_1, GRANT_HASH)
    expect(loadMigrationApprovalCleanupJournal(scope).obligations).toEqual([
      expect.objectContaining({
        attemptId: ATTEMPT_1,
        state: 'grant-submitted',
        grantHash: GRANT_HASH,
      }),
    ])
  })

  it('resolves only the exact rejected prompt attempt', () => {
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      123,
      ATTEMPT_1,
    )
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      124,
      ATTEMPT_2,
    )
    recordMigrationApprovalCleanupPromptRejected(
      scope,
      ATTEMPT_1,
      localStorage,
      125,
    )

    expect(loadMigrationApprovalCleanupJournal(scope).obligations).toEqual([
      expect.objectContaining({ attemptId: ATTEMPT_2 }),
    ])
  })

  it('lets a late submitted grant override an earlier rejection tombstone', () => {
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      123,
      ATTEMPT_1,
    )
    recordMigrationApprovalCleanupPromptRejected(
      scope,
      ATTEMPT_1,
      localStorage,
      124,
    )
    recordMigrationApprovalCleanupGrantHash(scope, ATTEMPT_1, GRANT_HASH)

    expect(loadMigrationApprovalCleanupObligation(scope)).toMatchObject({
      attemptId: ATTEMPT_1,
      state: 'grant-submitted',
      grantHash: GRANT_HASH,
    })
  })

  it('cannot erase a concurrent attempt with another attempt revocation', () => {
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      123,
      ATTEMPT_1,
    )
    recordMigrationApprovalCleanupGrantHash(scope, ATTEMPT_1, GRANT_HASH)
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      124,
      ATTEMPT_2,
    )
    recordMigrationApprovalCleanupRevocationHash(
      scope,
      REVOCATION_1,
      [ATTEMPT_1],
      REVOCATION_HASH,
    )
    recordMigrationApprovalCleanupRevocationConfirmed(scope, REVOCATION_1, [
      ATTEMPT_1,
    ])

    expect(loadMigrationApprovalCleanupJournal(scope).obligations).toEqual([
      expect.objectContaining({
        attemptId: ATTEMPT_2,
        state: 'prompt-pending',
      }),
    ])
  })

  it('keeps unrelated submitted grant hashes as independent evidence', () => {
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      123,
      ATTEMPT_1,
    )
    recordMigrationApprovalCleanupGrantHash(scope, ATTEMPT_1, GRANT_HASH)
    const replacement = recordMigrationApprovalCleanupGrantHash(
      scope,
      ATTEMPT_1,
      REPLACEMENT_GRANT_HASH,
    )
    recordMigrationApprovalCleanupRevocationHash(
      scope,
      REVOCATION_1,
      [ATTEMPT_1, replacement.attemptId],
      REVOCATION_HASH,
    )
    recordMigrationApprovalCleanupRevocationHash(
      scope,
      REVOCATION_1,
      [ATTEMPT_1, replacement.attemptId],
      REPLACEMENT_REVOCATION_HASH,
    )

    const pending = loadMigrationApprovalCleanupJournal(scope)
    expect(
      new Set(pending.obligations.map(({ grantHash }) => grantHash)),
    ).toEqual(new Set([GRANT_HASH, REPLACEMENT_GRANT_HASH]))
    expect(pending.pendingRevocations).toEqual([
      {
        revocationId: REVOCATION_1,
        attemptIds: [ATTEMPT_1, replacement.attemptId],
        hash: REPLACEMENT_REVOCATION_HASH,
      },
    ])

    recordMigrationApprovalCleanupRevocationConfirmed(scope, REVOCATION_1, [
      ATTEMPT_1,
      replacement.attemptId,
    ])
    expect(loadMigrationApprovalCleanupJournal(scope)).toEqual({
      obligations: [],
      pendingRevocations: [],
    })
  })

  it('projects a receipt-proven wallet replacement onto the same attempt', () => {
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      123,
      ATTEMPT_1,
    )
    recordMigrationApprovalCleanupGrantHash(scope, ATTEMPT_1, GRANT_HASH)

    const replacement = recordMigrationApprovalCleanupGrantReplacement(
      scope,
      ATTEMPT_1,
      GRANT_HASH,
      REPLACEMENT_GRANT_HASH,
      localStorage,
      124,
    )

    expect(replacement).toMatchObject({
      attemptId: ATTEMPT_1,
      state: 'grant-submitted',
      grantHash: REPLACEMENT_GRANT_HASH,
    })
    expect(loadMigrationApprovalCleanupJournal(scope).obligations).toEqual([
      expect.objectContaining({
        attemptId: ATTEMPT_1,
        grantHash: REPLACEMENT_GRANT_HASH,
      }),
    ])
    expect(() =>
      recordMigrationApprovalCleanupGrantReplacement(
        scope,
        ATTEMPT_1,
        GRANT_HASH,
        REVOCATION_HASH,
      ),
    ).toThrow(MigrationApprovalCleanupJournalValidationError)
  })

  it('retains evidence but resolves a failed revocation from pending state', () => {
    recordMigrationApprovalCleanupRequired(scope, localStorage, 123, ATTEMPT_1)
    recordMigrationApprovalCleanupRevocationHash(
      scope,
      REVOCATION_1,
      [ATTEMPT_1],
      REVOCATION_HASH,
    )
    recordMigrationApprovalCleanupRevocationFailed(scope, REVOCATION_1)

    expect(loadMigrationApprovalCleanupJournal(scope)).toMatchObject({
      obligations: [expect.objectContaining({ attemptId: ATTEMPT_1 })],
      pendingRevocations: [],
    })
  })

  it('isolates append-only keys by scope and attempt', () => {
    const otherScope = { ...scope, hca: OTHER_HCA }
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      123,
      ATTEMPT_1,
    )
    recordMigrationApprovalCleanupGrantAttempt(
      scope,
      localStorage,
      124,
      ATTEMPT_2,
    )
    recordMigrationApprovalCleanupRequired(
      otherScope,
      localStorage,
      125,
      ATTEMPT_1,
    )

    const keys = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    ).filter((key): key is string => key !== null)
    expect(keys).toHaveLength(3)
    expect(
      keys.every((key) =>
        key.startsWith(MIGRATION_APPROVAL_CLEANUP_STORAGE_KEY_PREFIX),
      ),
    ).toBe(true)
    expect(loadMigrationApprovalCleanupJournal(scope).obligations).toHaveLength(
      2,
    )
    expect(
      loadMigrationApprovalCleanupJournal(otherScope).obligations,
    ).toHaveLength(1)
  })

  it.each([
    {
      description: 'a legacy generation-zero historical marker',
      legacy: {
        version: 1,
        scope,
        approvalId: MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
        generation: 0,
        createdAt: 123,
      },
      expectedAttemptId: 'legacy-v1-historical:0:123',
      expectedState: 'historical',
    },
    {
      description: 'a legacy hashless grant prompt',
      legacy: {
        version: 1,
        scope,
        approvalId: MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
        generation: 1,
        createdAt: 123,
      },
      expectedAttemptId: 'legacy-v1-prompt:1:123',
      expectedState: 'prompt-pending',
    },
    {
      description: 'an ambiguous first-version marker',
      legacy: {
        version: 1,
        scope,
        approvalId: MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
        createdAt: 123,
      },
      expectedAttemptId: 'legacy-v1-prompt:unknown:123',
      expectedState: 'prompt-pending',
    },
  ])('safely imports $description', ({
    legacy,
    expectedAttemptId,
    expectedState,
  }) => {
    localStorage.setItem(
      getMigrationApprovalCleanupStorageKey(scope),
      JSON.stringify(legacy),
    )
    expect(loadMigrationApprovalCleanupObligation(scope)).toMatchObject({
      attemptId: expectedAttemptId,
      state: expectedState,
    })
    localStorage.removeItem(getMigrationApprovalCleanupStorageKey(scope))
    expect(loadMigrationApprovalCleanupObligation(scope)).toMatchObject({
      attemptId: expectedAttemptId,
      state: expectedState,
    })
  })

  it('imports a legacy submitted grant as dischargeable evidence', () => {
    localStorage.setItem(
      getMigrationApprovalCleanupStorageKey(scope),
      JSON.stringify({
        version: 1,
        scope,
        approvalId: MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
        generation: 1,
        grantHash: GRANT_HASH,
        createdAt: 123,
      }),
    )
    expect(loadMigrationApprovalCleanupObligation(scope)).toMatchObject({
      attemptId: `legacy-v1-grant:1:123:${GRANT_HASH}`,
      state: 'grant-submitted',
      grantHash: GRANT_HASH,
    })
    localStorage.removeItem(getMigrationApprovalCleanupStorageKey(scope))
    expect(loadMigrationApprovalCleanupObligation(scope)).toMatchObject({
      attemptId: `legacy-v1-grant:1:123:${GRANT_HASH}`,
      state: 'grant-submitted',
      grantHash: GRANT_HASH,
    })
  })

  it('does not let an old legacy revocation discharge overwritten grant evidence', () => {
    const legacyKey = getMigrationApprovalCleanupStorageKey(scope)
    localStorage.setItem(
      legacyKey,
      JSON.stringify({
        version: 1,
        scope,
        approvalId: MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
        generation: 1,
        grantHash: GRANT_HASH,
        createdAt: 123,
      }),
    )
    const firstAttempt = loadMigrationApprovalCleanupObligation(scope)
    if (!firstAttempt) throw new Error('Expected legacy grant evidence')
    recordMigrationApprovalCleanupRevocationHash(
      scope,
      REVOCATION_1,
      [firstAttempt.attemptId],
      REVOCATION_HASH,
    )
    recordMigrationApprovalCleanupRevocationConfirmed(scope, REVOCATION_1, [
      firstAttempt.attemptId,
    ])

    localStorage.setItem(
      legacyKey,
      JSON.stringify({
        version: 1,
        scope,
        approvalId: MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
        generation: 2,
        grantHash: REPLACEMENT_GRANT_HASH,
        revocationHash: REVOCATION_HASH,
        createdAt: 124,
      }),
    )

    expect(loadMigrationApprovalCleanupJournal(scope)).toMatchObject({
      obligations: [
        {
          attemptId: `legacy-v1-grant:2:124:${REPLACEMENT_GRANT_HASH}`,
          state: 'grant-submitted',
          grantHash: REPLACEMENT_GRANT_HASH,
        },
      ],
      pendingRevocations: [],
    })
  })

  it('resumes idempotently after a partial multi-attempt confirmation', () => {
    for (const [attemptId, hash] of [
      [ATTEMPT_1, GRANT_HASH],
      [ATTEMPT_2, REPLACEMENT_GRANT_HASH],
    ] as const) {
      recordMigrationApprovalCleanupGrantAttempt(
        scope,
        localStorage,
        123,
        attemptId,
      )
      recordMigrationApprovalCleanupGrantHash(scope, attemptId, hash)
    }
    recordMigrationApprovalCleanupRevocationHash(
      scope,
      REVOCATION_1,
      [ATTEMPT_1, ATTEMPT_2],
      REVOCATION_HASH,
    )

    recordMigrationApprovalCleanupRevocationConfirmed(
      scope,
      REVOCATION_1,
      [ATTEMPT_1],
      localStorage,
      124,
    )
    expect(() =>
      recordMigrationApprovalCleanupRevocationConfirmed(
        scope,
        REVOCATION_1,
        [ATTEMPT_1, ATTEMPT_2],
        localStorage,
        125,
      ),
    ).not.toThrow()
    expect(loadMigrationApprovalCleanupJournal(scope).obligations).toEqual([])
  })

  it('fails closed for corrupt scope records', () => {
    localStorage.setItem(
      getMigrationApprovalCleanupStorageKey(scope),
      '{bad json',
    )
    expect(() => loadMigrationApprovalCleanupJournal(scope)).toThrow(
      MigrationApprovalCleanupJournalCorruptError,
    )
  })

  it('fails closed when storage is unavailable', () => {
    expect(() => loadMigrationApprovalCleanupJournal(scope, null)).toThrow(
      MigrationApprovalCleanupJournalUnavailableError,
    )
  })

  it('validates scope, identifiers, hashes, and timestamps before writes', () => {
    expect(() =>
      recordMigrationApprovalCleanupGrantAttempt(
        { ...scope, chainId: 0 },
        localStorage,
        123,
        ATTEMPT_1,
      ),
    ).toThrow(MigrationApprovalCleanupJournalValidationError)
    expect(() =>
      recordMigrationApprovalCleanupGrantAttempt(
        scope,
        localStorage,
        -1,
        ATTEMPT_1,
      ),
    ).toThrow(MigrationApprovalCleanupJournalValidationError)
    expect(() =>
      recordMigrationApprovalCleanupGrantAttempt(
        scope,
        localStorage,
        123,
        'not-an-id',
      ),
    ).toThrow(MigrationApprovalCleanupJournalValidationError)
    expect(() =>
      recordMigrationApprovalCleanupGrantHash(
        scope,
        ATTEMPT_1,
        '0x1234' as Hex,
      ),
    ).toThrow()
  })

  it('fails closed and does not notify when a write throws', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeMigrationApprovalCleanupJournal(listener)
    const initialRevision = getMigrationApprovalCleanupJournalRevision()
    const throwingStorage: MigrationApprovalCleanupJournalStorage = {
      length: 0,
      key: () => null,
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => undefined,
    }

    expect(() =>
      recordMigrationApprovalCleanupRequired(
        scope,
        throwingStorage,
        123,
        ATTEMPT_1,
      ),
    ).toThrow(MigrationApprovalCleanupJournalUnavailableError)
    expect(getMigrationApprovalCleanupJournalRevision()).toBe(initialRevision)
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('publishes local changes and matching cross-tab storage events', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeMigrationApprovalCleanupJournal(listener)
    const initialRevision = getMigrationApprovalCleanupJournalRevision()

    recordMigrationApprovalCleanupRequired(scope, localStorage, 123, ATTEMPT_1)
    expect(getMigrationApprovalCleanupJournalRevision()).toBe(
      initialRevision + 1,
    )
    expect(listener).toHaveBeenCalledTimes(1)

    window.dispatchEvent(
      new StorageEvent('storage', { key: 'unrelated-storage-key' }),
    )
    expect(listener).toHaveBeenCalledTimes(1)
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: `${getMigrationApprovalCleanupStorageKey(scope)}:attempt:${ATTEMPT_2}`,
      }),
    )
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })
})
