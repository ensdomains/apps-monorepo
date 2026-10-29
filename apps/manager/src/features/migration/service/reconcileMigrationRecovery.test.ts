import { Storage } from 'happy-dom'
import { okAsync } from 'neverthrow'
import { type Address, namehash } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import { makeDomain } from './_fixtures'
import { makeConfirmedMigration } from './_fixtures/confirmedMigration'
import {
  loadMigrationBatchJournal,
  persistMigrationRecoverySnapshot,
  persistPendingAtomicMigrationAttempt,
  persistSubmittedAtomicMigrationBatch,
  removePendingAtomicMigrationIntent,
} from './migrationBatchJournal'
import {
  restoreMigrationCompletionCheckpoint,
  verifyAndPersistMigrationCompletionCheckpoint,
} from './migrationCompletionCheckpoint'
import { reconcileMigrationRecovery } from './reconcileMigrationRecovery'

const operations = [{ name: 'alice.eth', action: 'migrate' as const }]
const intent = { id: 'closed-tab', names: ['alice.eth'], operations }
const otherOwner: Address = '0x0000000000000000000000000000000000000003'
const setup = () => {
  const confirmed = makeConfirmedMigration()
  persistPendingAtomicMigrationAttempt(confirmed.scope, {
    intent,
    recovery: {
      registryDomains: [makeDomain({ id: namehash('alice.eth') })],
      registryOperations: operations,
      remainingOperations: operations,
      completedOperations: [],
      profiles: new Map(),
      ownedPermRes: null,
      plannedApprovals: [],
      managerRestorationNames: [],
    },
  })
  const submission = {
    intentId: intent.id,
    hash: confirmed.hash,
    names: intent.names,
    operations,
  }
  return {
    ...confirmed,
    submission,
    run: (signal?: AbortSignal) =>
      reconcileMigrationRecovery({
        ...confirmed,
        historyClient: bigname,
        signal,
      }),
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new Storage())
  vi.spyOn(bigname, 'nameHistory').mockReturnValue(
    okAsync({ data: [], meta: { as_of: {} } }),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('reconcileMigrationRecovery', () => {
  it('clears a completed-only snapshot left by interruption after receipt removal', async () => {
    const test = setup()
    await verifyAndPersistMigrationCompletionCheckpoint({
      ...test,
      transactionHash: test.hash,
      operations,
    })
    const { recovery } = loadMigrationBatchJournal(test.scope)
    if (!recovery) throw new Error('Missing test recovery')
    persistMigrationRecoverySnapshot(test.scope, {
      ...recovery,
      remainingOperations: [],
      completedOperations: operations,
    })
    removePendingAtomicMigrationIntent(test.scope, intent.id)

    await test.run()

    expect(loadMigrationBatchJournal(test.scope)).toEqual({
      pending: [],
      submitted: [],
      recovery: null,
    })
  })

  it('discovers a missing hash from history and verifies it before settling the saved attempt', async () => {
    const test = setup()
    vi.mocked(bigname.nameHistory).mockReturnValue(
      okAsync({
        data: [
          {
            id: 'migration',
            type: 'migration',
            name: 'alice.eth',
            namespace: 'ens',
            registration_id: null,
            block_number: 123,
            timestamp: '123',
            transaction_hash: test.hash,
            log_index: 0,
          },
        ],
        meta: { as_of: {} },
      }),
    )

    await test.run()

    expect(loadMigrationBatchJournal(test.scope)).toEqual({
      pending: [],
      submitted: [],
      recovery: null,
    })
    await expect(restoreMigrationCompletionCheckpoint(test)).resolves.toEqual(
      operations[0],
    )
  })

  it.each([
    'pending',
    'reverted',
    'different-owner',
    'unrelated-calldata',
    'historical-read-failure',
  ] as const)('retains retry protection for %s evidence', async (evidence) => {
    const test = setup()
    persistSubmittedAtomicMigrationBatch(test.scope, test.submission)
    const before = loadMigrationBatchJournal(test.scope)
    if (evidence === 'pending')
      test.getReceipt.mockRejectedValue(new Error('Receipt not found'))
    if (evidence === 'reverted')
      test.getReceipt.mockResolvedValue({ ...test.receipt, status: 'reverted' })
    if (evidence === 'different-owner')
      test.getTransaction.mockResolvedValue({
        ...test.transaction,
        from: otherOwner,
      })
    if (evidence === 'unrelated-calldata')
      test.getTransaction.mockResolvedValue({
        ...test.transaction,
        input: '0x',
      })
    if (evidence === 'historical-read-failure')
      vi.spyOn(test.publicClient, 'readContract').mockRejectedValue(
        new Error('Archive unavailable'),
      )

    await test.run()

    expect(loadMigrationBatchJournal(test.scope)).toEqual(before)
    await expect(restoreMigrationCompletionCheckpoint(test)).resolves.toBeNull()
  })

  it('preserves work added while receipt verification is in flight', async () => {
    const test = setup()
    persistSubmittedAtomicMigrationBatch(test.scope, test.submission)
    const later = {
      id: 'another-attempt',
      names: ['bob.eth'],
      operations: [{ name: 'bob.eth', action: 'copy' as const }],
    }
    test.getReceipt.mockImplementationOnce(async () => {
      const { recovery } = loadMigrationBatchJournal(test.scope)
      if (!recovery) throw new Error('Missing test recovery')
      persistPendingAtomicMigrationAttempt(test.scope, {
        intent: later,
        recovery: {
          ...recovery,
          registryDomains: [
            ...recovery.registryDomains,
            makeDomain({
              id: namehash('bob.eth'),
              name: 'bob.eth',
              labelName: 'bob',
            }),
          ],
          registryOperations: [...operations, ...later.operations],
          remainingOperations: [...operations, ...later.operations],
        },
      })
      return test.receipt
    })

    await test.run()

    const after = loadMigrationBatchJournal(test.scope)
    expect(after.pending).toEqual([later])
    expect(after.submitted).toEqual([])
    expect(after.recovery?.remainingOperations).toEqual(later.operations)
    expect(after.recovery?.completedOperations).toEqual(operations)
  })

  it('does not settle after its caller aborts during verification', async () => {
    const test = setup()
    persistSubmittedAtomicMigrationBatch(test.scope, test.submission)
    const before = loadMigrationBatchJournal(test.scope)
    const controller = new AbortController()
    test.getReceipt.mockImplementationOnce(async () => {
      controller.abort()
      return test.receipt
    })

    await expect(test.run(controller.signal)).rejects.toThrow()
    expect(loadMigrationBatchJournal(test.scope)).toEqual(before)
  })

  it('preserves the attempt if durable completion evidence cannot be written', async () => {
    const test = setup()
    persistSubmittedAtomicMigrationBatch(test.scope, test.submission)
    const before = loadMigrationBatchJournal(test.scope)
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage full')
    })

    await test.run()

    expect(loadMigrationBatchJournal(test.scope)).toEqual(before)
  })
})
