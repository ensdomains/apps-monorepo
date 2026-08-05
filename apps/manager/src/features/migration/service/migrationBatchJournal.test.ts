import type { Address, Hex } from 'viem'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadPendingAtomicMigrationIntents,
  loadSubmittedAtomicMigrationBatches,
  migrationBatchJournalStorageKey,
  persistPendingAtomicMigrationIntent,
  persistSubmittedAtomicMigrationBatch,
  removePendingAtomicMigrationIntent,
  removeSubmittedAtomicMigrationBatch,
} from './migrationBatchJournal'

const scope = {
  chainId: 11155111,
  owner: '0x0000000000000000000000000000000000000001' as Address,
  hca: '0x0000000000000000000000000000000000000002' as Address,
}
const first = {
  intentId: 'intent-1',
  hash: `0x${'1'.repeat(64)}` as Hex,
  names: ['alice.eth', 'bob.eth'],
}
const second = {
  intentId: 'intent-2',
  hash: `0x${'2'.repeat(64)}` as Hex,
  names: ['carol.eth'],
}

beforeEach(() => localStorage.clear())

describe('migration batch journal', () => {
  it('durably records an intent before a transaction hash exists', () => {
    const intent = { id: 'intent-1', names: ['alice.eth'] }

    persistPendingAtomicMigrationIntent(scope, intent)

    expect(loadPendingAtomicMigrationIntents(scope)).toEqual([intent])
    removePendingAtomicMigrationIntent(scope, intent.id)
    expect(loadPendingAtomicMigrationIntents(scope)).toEqual([])
  })

  it('persists submitted hashes by chain, owner, and HCA', () => {
    persistSubmittedAtomicMigrationBatch(scope, first)

    expect(loadSubmittedAtomicMigrationBatches(scope)).toEqual([first])
    expect(
      loadSubmittedAtomicMigrationBatches({
        ...scope,
        hca: '0x0000000000000000000000000000000000000003',
      }),
    ).toEqual([])
  })

  it('removes only the resolved submission', () => {
    persistSubmittedAtomicMigrationBatch(scope, first)
    persistSubmittedAtomicMigrationBatch(scope, second)

    removeSubmittedAtomicMigrationBatch(scope, first.hash)

    expect(loadSubmittedAtomicMigrationBatches(scope)).toEqual([second])
  })

  it('fails closed for malformed storage', () => {
    localStorage.setItem(migrationBatchJournalStorageKey, '{bad json')

    expect(() => loadSubmittedAtomicMigrationBatches(scope)).toThrow(
      'Refusing to continue without retry state',
    )
  })

  it('fails closed when submitted-transaction storage is unavailable', () => {
    expect(() => loadSubmittedAtomicMigrationBatches(scope, null)).toThrow(
      'Refusing to continue without retry protection',
    )
  })

  it('surfaces a durable-write failure before submission can continue', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => undefined,
    }

    expect(() =>
      persistPendingAtomicMigrationIntent(
        scope,
        { id: 'intent-1', names: ['alice.eth'] },
        storage,
      ),
    ).toThrow('quota exceeded')
  })
})
