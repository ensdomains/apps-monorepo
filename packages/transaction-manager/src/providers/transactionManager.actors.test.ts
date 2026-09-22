/**
 * Actor-lifetime cover for the manager's in-memory map.
 *
 * A terminal actor is kept after it is archived — the modal reads a finished
 * step's status, hash and actual cost straight off its snapshot — so the map
 * has to be pruned at the flow's boundaries instead: when an id is taken over
 * by a new attempt, and when the connected wallet changes.
 */

import {
  type Address,
  createWalletClient,
  custom,
  type EIP1193Provider,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
} from 'viem'
import { afterEach, describe, expect, it } from 'vitest'
import { waitForTransaction } from '../helpers/waitForTransaction'
import type { EOASigner } from '../types/signer.types'
import type { TransactionIntent } from '../types/transaction.types'
import { resolveOwnerAccount, transactionManager } from './transactionManager'

const CHAIN_ID = 11155111
const ACCOUNT_A = '0x1111111111111111111111111111111111111111' as Address
const ACCOUNT_B = '0x2222222222222222222222222222222222222222' as Address
const TARGET = '0x00000000000000000000000000000000000000ff' as Address
const HASH = `0x${'ab'.repeat(32)}` as Hash

const publicClient = {
  waitForTransactionReceipt: async () =>
    ({ status: 'success', transactionHash: HASH }) as TransactionReceipt,
} as unknown as PublicClient

function createWallet(address: Address) {
  const methods: string[] = []

  const walletClient = createWalletClient({
    account: address,
    transport: custom({
      request: async ({ method }: { method: string }) => {
        methods.push(method)
        if (method === 'eth_sendTransaction') return HASH
        throw new Error(`Unexpected RPC call in test: ${method}`)
      },
    } as unknown as EIP1193Provider),
  })

  const signer: EOASigner = { type: 'eoa', walletClient }

  return {
    signer,
    sends: () => methods.filter((method) => method === 'eth_sendTransaction'),
  }
}

const intentFrom = (from: Address): TransactionIntent => ({
  type: 'custom',
  request: {
    type: 'eoa',
    from,
    to: TARGET,
    data: '0x',
    value: 0n,
    chainId: CHAIN_ID,
  },
})

const run = async (
  id: string,
  from: Address,
  signer: EOASigner,
): Promise<void> => {
  const txId = transactionManager.startTransaction(intentFrom(from), signer, {
    id,
    publicClient,
    chainId: CHAIN_ID,
  })
  await waitForTransaction(txId)
}

afterEach(() => {
  transactionManager.clear()
  transactionManager.setConnectedAccount(undefined)
})

describe('resolveOwnerAccount', () => {
  it('prefers the explicit account', () => {
    expect(
      resolveOwnerAccount({
        account: ACCOUNT_B,
        intent: intentFrom(ACCOUNT_A),
      }),
    ).toBe(ACCOUNT_B.toLowerCase())
  })

  it('falls back to a custom intent request', () => {
    expect(resolveOwnerAccount({ intent: intentFrom(ACCOUNT_A) })).toBe(
      ACCOUNT_A.toLowerCase(),
    )
  })

  it('falls back to a renewal intent from', () => {
    expect(
      resolveOwnerAccount({
        intent: {
          type: 'ens-renewal',
          name: 'leon',
          duration: 1n,
          from: ACCOUNT_A,
        },
      }),
    ).toBe(ACCOUNT_A.toLowerCase())
  })

  it('is undefined when nothing states the signing account', () => {
    expect(resolveOwnerAccount({})).toBeUndefined()
  })
})

describe('reusing a transaction id', () => {
  it('retires the actor the id already held', async () => {
    const wallet = createWallet(ACCOUNT_A)

    await run('tx-step', ACCOUNT_A, wallet.signer)
    const first = transactionManager.getTransaction('tx-step')
    expect(first?.getSnapshot().value).toBe('success')

    await run('tx-step', ACCOUNT_A, wallet.signer)
    const second = transactionManager.getTransaction('tx-step')

    expect(second).not.toBe(first)
    expect(first?.getSnapshot().status).toBe('stopped')
    expect(wallet.sends()).toHaveLength(2)
    expect(transactionManager.getTransactions().size).toBe(1)
  })
})

describe('setConnectedAccount', () => {
  it('retires the actors another account owns', async () => {
    const wallet = createWallet(ACCOUNT_A)
    transactionManager.setConnectedAccount(ACCOUNT_A)

    await run('tx-step', ACCOUNT_A, wallet.signer)
    expect(transactionManager.getTransaction('tx-step')).toBeDefined()

    transactionManager.setConnectedAccount(ACCOUNT_B)

    expect(transactionManager.getTransaction('tx-step')).toBeUndefined()
    expect(transactionManager.getTransactions().size).toBe(0)
  })

  it('drops them on disconnect too', async () => {
    const wallet = createWallet(ACCOUNT_A)
    transactionManager.setConnectedAccount(ACCOUNT_A)
    await run('tx-step', ACCOUNT_A, wallet.signer)

    transactionManager.setConnectedAccount(undefined)

    expect(transactionManager.getTransaction('tx-step')).toBeUndefined()
  })

  it('keeps the current account’s actors when the same account is re-stated', async () => {
    const wallet = createWallet(ACCOUNT_A)
    transactionManager.setConnectedAccount(ACCOUNT_A)
    await run('tx-step', ACCOUNT_A, wallet.signer)

    transactionManager.setConnectedAccount(ACCOUNT_A)

    expect(transactionManager.getTransaction('tx-step')).toBeDefined()
  })

  it('notifies subscribers when it prunes', async () => {
    const wallet = createWallet(ACCOUNT_A)
    transactionManager.setConnectedAccount(ACCOUNT_A)
    await run('tx-step', ACCOUNT_A, wallet.signer)

    const sizes: number[] = []
    const unsubscribe = transactionManager.onTransactionsChange((txs) =>
      sizes.push(txs.size),
    )

    transactionManager.setConnectedAccount(ACCOUNT_B)
    unsubscribe()

    expect(sizes).toEqual([0])
  })
})
