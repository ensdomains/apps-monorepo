import { type Address, type Hex, namehash } from 'viem'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeDomain } from './_fixtures'
import {
  clearMigrationBatchJournalScope,
  loadMigrationRecoverySnapshot,
  loadPendingAtomicMigrationIntents,
  loadSubmittedAtomicMigrationBatches,
  persistMigrationRecoverySnapshot,
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
  operations: [
    { name: 'alice.eth', action: 'migrate' as const },
    { name: 'bob.eth', action: 'copy' as const },
  ],
}
const second = {
  intentId: 'intent-2',
  hash: `0x${'2'.repeat(64)}` as Hex,
  names: ['carol.eth'],
  operations: [{ name: 'carol.eth', action: 'migrate' as const }],
}

beforeEach(() => localStorage.clear())

describe('migration batch journal', () => {
  it('persists an immutable tree, exact records, and remaining copy operations', () => {
    const root = makeDomain({ name: 'alice.eth', labelName: 'alice' })
    const copy = makeDomain({
      name: 'sub.alice.eth',
      labelName: 'sub',
      parentName: 'alice.eth',
      registrantId: null,
    })
    const copyNode = namehash(copy.name)
    persistMigrationRecoverySnapshot(scope, {
      registryDomains: [root, copy],
      registryOperations: [
        { name: root.name, action: 'migrate' },
        { name: copy.name, action: 'copy' },
      ],
      remainingOperations: [{ name: copy.name, action: 'copy' }],
      completedOperations: [{ name: root.name, action: 'migrate' }],
      profiles: new Map([
        [
          copyNode,
          {
            texts: [{ key: 'url', value: 'https://example.test' }],
            addresses: [{ coinType: 60n, value: '0x1234' }],
            contentHash: '0xe301',
            abis: [{ contentType: 1n, value: '0x5b5d' }],
          },
        ],
      ]),
      ownedPermRes: '0x0000000000000000000000000000000000000004',
      plannedApprovals: [
        { id: 'eth-registry:hca' },
        { id: 'base-registrar:hca-token', tokenId: 123n },
      ],
    })

    expect(loadMigrationRecoverySnapshot(scope)).toEqual({
      registryDomains: [root, copy],
      registryOperations: [
        { name: root.name, action: 'migrate' },
        { name: copy.name, action: 'copy' },
      ],
      remainingOperations: [{ name: copy.name, action: 'copy' }],
      completedOperations: [{ name: root.name, action: 'migrate' }],
      profiles: new Map([
        [
          copyNode,
          {
            texts: [{ key: 'url', value: 'https://example.test' }],
            addresses: [{ coinType: 60n, value: '0x1234' }],
            contentHash: '0xe301',
            abis: [{ contentType: 1n, value: '0x5b5d' }],
          },
        ],
      ]),
      ownedPermRes: '0x0000000000000000000000000000000000000004',
      plannedApprovals: [
        { id: 'eth-registry:hca' },
        { id: 'base-registrar:hca-token', tokenId: 123n },
      ],
    })

    persistPendingAtomicMigrationIntent(scope, {
      id: 'copy-intent',
      names: [copy.name],
      operations: [{ name: copy.name, action: 'copy' }],
    })
    removePendingAtomicMigrationIntent(scope, 'copy-intent')
    expect(loadMigrationRecoverySnapshot(scope)?.remainingOperations).toEqual([
      { name: copy.name, action: 'copy' },
    ])
  })

  it('durably records an intent before a transaction hash exists', () => {
    const intent = {
      id: 'intent-1',
      names: ['alice.eth'],
      operations: [{ name: 'alice.eth', action: 'migrate' as const }],
    }

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

  it('reads legacy name-only entries as direct migrations', () => {
    const legacy = {
      version: 1,
      entries: [
        {
          scope: `${scope.chainId}:${scope.owner.toLowerCase()}:${scope.hca.toLowerCase()}`,
          intents: [{ id: 'legacy-intent', names: ['alice.eth'] }],
          submissions: [
            {
              intentId: 'legacy-intent',
              hash: first.hash,
              names: ['alice.eth'],
            },
          ],
        },
      ],
    }
    localStorage.setItem(
      'ens-apps:atomic-hca-migration:submitted-batches:v1:8d1c893',
      JSON.stringify(legacy),
    )

    expect(loadPendingAtomicMigrationIntents(scope)).toEqual([
      {
        id: 'legacy-intent',
        names: ['alice.eth'],
        operations: [{ name: 'alice.eth', action: 'migrate' }],
      },
    ])
    expect(loadSubmittedAtomicMigrationBatches(scope)).toEqual([
      {
        intentId: 'legacy-intent',
        hash: first.hash,
        names: ['alice.eth'],
        operations: [{ name: 'alice.eth', action: 'migrate' }],
      },
    ])
  })

  it('fails closed when stored operations do not match the recorded names', () => {
    localStorage.setItem(
      'ens-apps:atomic-hca-migration:submitted-batches:v1:8d1c893',
      JSON.stringify({
        version: 1,
        entries: [
          {
            scope: `${scope.chainId}:${scope.owner.toLowerCase()}:${scope.hca.toLowerCase()}`,
            intents: [],
            submissions: [
              {
                intentId: 'mismatched-intent',
                hash: first.hash,
                names: ['alice.eth'],
                operations: [{ name: 'bob.eth', action: 'copy' }],
              },
            ],
          },
        ],
      }),
    )

    expect(() => loadSubmittedAtomicMigrationBatches(scope)).toThrow(
      'Refusing to continue without retry state',
    )
  })

  it('removes only the resolved submission', () => {
    persistSubmittedAtomicMigrationBatch(scope, first)
    persistSubmittedAtomicMigrationBatch(scope, second)

    removeSubmittedAtomicMigrationBatch(scope, first.hash)

    expect(loadSubmittedAtomicMigrationBatches(scope)).toEqual([second])
  })

  it('clears only the completed wallet and HCA scope', () => {
    const otherScope = {
      ...scope,
      hca: '0x0000000000000000000000000000000000000003' as Address,
    }
    persistSubmittedAtomicMigrationBatch(scope, first)
    persistSubmittedAtomicMigrationBatch(otherScope, second)

    clearMigrationBatchJournalScope(scope)

    expect(loadSubmittedAtomicMigrationBatches(scope)).toEqual([])
    expect(loadSubmittedAtomicMigrationBatches(otherScope)).toEqual([second])
  })

  it('fails closed for malformed storage', () => {
    const storage = {
      getItem: () => '{bad json',
      setItem: () => undefined,
      removeItem: () => undefined,
    }

    expect(() => loadSubmittedAtomicMigrationBatches(scope, storage)).toThrow(
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
        {
          id: 'intent-1',
          names: ['alice.eth'],
          operations: [{ name: 'alice.eth', action: 'migrate' }],
        },
        storage,
      ),
    ).toThrow('quota exceeded')
  })
})
