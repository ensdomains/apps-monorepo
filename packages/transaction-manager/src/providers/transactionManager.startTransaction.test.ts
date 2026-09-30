import type { Hex, PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMachine } from 'xstate'
import type { ArchivedTransaction } from '../types/audit.types'
import type { Signer, TransactionRequest } from '../types/transaction.types'

// A transaction actor that reaches `success` on the next macrotask, so the
// manager's subscriber runs its terminal branch. Started *before* the manager
// subscribes, which is why the initial state alone would emit nothing.
vi.mock('../machines/transaction.machine', () => ({
  transactionMachine: createMachine({
    id: 'stub-transaction',
    initial: 'submitting',
    context: () => ({}),
    states: {
      submitting: { after: { 0: 'success' } },
      success: {},
    },
  }),
}))

vi.mock('../helpers/transaction-persistence', () => ({
  saveTransaction: vi.fn().mockResolvedValue(undefined),
  archiveTransaction: vi.fn().mockResolvedValue(undefined),
  removeTransaction: vi.fn().mockResolvedValue(undefined),
  clearAllTransactions: vi.fn().mockResolvedValue(undefined),
}))

import { transactionManager } from './transactionManager'

const FROM = '0x1111111111111111111111111111111111111111' as Hex
const TO = '0x2222222222222222222222222222222222222222' as Hex
const CHAIN_ID = 11155111

const request: TransactionRequest = {
  type: 'eoa',
  from: FROM,
  to: TO,
  data: '0x' as Hex,
  value: 0n,
  chainId: CHAIN_ID,
}

const signer = { type: 'eoa', walletClient: {} } as unknown as Signer
const publicClient = {} as PublicClient

/** Resolves with the next archived transaction the manager reports. */
function nextArchived(): Promise<ArchivedTransaction> {
  return new Promise((resolve) => {
    const unsubscribe = transactionManager.onTransactionArchived((archived) => {
      unsubscribe()
      resolve(archived)
    })
  })
}

describe('startTransaction', () => {
  beforeEach(() => {
    transactionManager.clear()
  })

  // Registration call sites pass only { id, description, publicClient,
  // timeout }; the chain is on the request. An archived record with no
  // chainId is dropped by history reporting, so the registration never
  // reaches the user's history.
  it('archives the request chainId when options omit it', async () => {
    const archived = nextArchived()

    transactionManager.startTransaction(request, signer, {
      id: 'tx-chain',
      publicClient,
    })

    expect((await archived).chainId).toBe(CHAIN_ID)
  })

  // Registration starts its steps with `{ type: 'custom', request }`, so the
  // chain is on the embedded request, not on the intent itself.
  it('archives the chainId of a custom intent’s request', async () => {
    const archived = nextArchived()

    transactionManager.startTransaction({ type: 'custom', request }, signer, {
      id: 'tx-chain-custom',
      publicClient,
    })

    expect((await archived).chainId).toBe(CHAIN_ID)
  })

  it('prefers an explicit options chainId over the request', async () => {
    const archived = nextArchived()

    transactionManager.startTransaction(request, signer, {
      id: 'tx-chain-explicit',
      publicClient,
      chainId: 1,
    })

    expect((await archived).chainId).toBe(1)
  })

  // Registration ids are deterministic constants and RETRY re-invokes
  // startTransaction with the same one. The completed-id set used to be
  // permanent, so the retry's archive, history and telemetry were all skipped.
  it('reports terminal side effects again when a completed id is restarted', async () => {
    const first = nextArchived()
    transactionManager.startTransaction(request, signer, {
      id: 'tx-reg-register',
      publicClient,
    })
    expect((await first).txId).toBe('tx-reg-register')

    const second = nextArchived()
    transactionManager.startTransaction(request, signer, {
      id: 'tx-reg-register',
      publicClient,
    })

    await expect(second).resolves.toMatchObject({
      txId: 'tx-reg-register',
      status: 'success',
    })
  })
})
