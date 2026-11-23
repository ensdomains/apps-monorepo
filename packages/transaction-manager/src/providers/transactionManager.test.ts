import {
  createWalletClient,
  custom,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  toHex,
} from 'viem'
import { sepolia } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTransactionHistory } from '../helpers/transaction-persistence'
import { waitForTransaction } from '../helpers/waitForTransaction'
import type { EOASigner } from '../types/signer.types'
import type { TransactionRequest } from '../types/transaction.types'
import {
  type ArchivedTransaction,
  buildArchivedTransaction,
  transactionManager,
} from './transactionManager'

const TIMESTAMP = 1_700_000_000_000
const HASH = '0xabc' as Hash
const FROM = '0x1111111111111111111111111111111111111111' as Hex
const TO = '0x2222222222222222222222222222222222222222' as Hex

const customRequest: TransactionRequest = {
  type: 'eoa',
  from: FROM,
  to: TO,
  data: '0x' as Hex,
  value: 0n,
  chainId: 11155111,
}

describe('buildArchivedTransaction', () => {
  it('passes through the core terminal fields', () => {
    const archived = buildArchivedTransaction({
      txId: 'tx-1',
      chainId: 11155111,
      status: 'success',
      hash: HASH,
      operation: 'set-resolver',
      name: 'leon.eth',
      timestamp: TIMESTAMP,
    })

    expect(archived).toMatchObject({
      txId: 'tx-1',
      chainId: 11155111,
      status: 'success',
      hash: HASH,
      operation: 'set-resolver',
      name: 'leon.eth',
      timestamp: TIMESTAMP,
    })
  })

  it('carries the error message for failed transactions', () => {
    const archived = buildArchivedTransaction({
      txId: 'tx-2',
      status: 'error',
      error: 'reverted',
      timestamp: TIMESTAMP,
    })

    expect(archived.status).toBe('error')
    expect(archived.error).toBe('reverted')
  })

  describe('name fallback', () => {
    it('prefers the caller-supplied option name', () => {
      const archived = buildArchivedTransaction({
        txId: 'tx',
        status: 'success',
        name: 'explicit.eth',
        intent: {
          type: 'ens-renewal',
          name: 'fromintent',
          duration: 1n,
          from: FROM,
        },
        timestamp: TIMESTAMP,
      })

      expect(archived.name).toBe('explicit.eth')
    })

    it('falls back to the intent name for ENS renewals', () => {
      const archived = buildArchivedTransaction({
        txId: 'tx',
        status: 'success',
        intent: {
          type: 'ens-renewal',
          name: 'fromintent',
          duration: 1n,
          from: FROM,
        },
        timestamp: TIMESTAMP,
      })

      expect(archived.name).toBe('fromintent')
    })

    it('is undefined when neither option nor renewal intent supplies one', () => {
      const archived = buildArchivedTransaction({
        txId: 'tx',
        status: 'success',
        intent: { type: 'custom', request: customRequest },
        timestamp: TIMESTAMP,
      })

      expect(archived.name).toBeUndefined()
    })
  })

  describe('request fallback', () => {
    it('prefers the prepared request', () => {
      const archived = buildArchivedTransaction({
        txId: 'tx',
        status: 'success',
        request: customRequest,
        intent: { type: 'custom', request: { ...customRequest, to: FROM } },
        timestamp: TIMESTAMP,
      })

      expect(archived.request).toBe(customRequest)
    })

    it('falls back to a custom intent embedded request', () => {
      const archived = buildArchivedTransaction({
        txId: 'tx',
        status: 'success',
        intent: { type: 'custom', request: customRequest },
        timestamp: TIMESTAMP,
      })

      expect(archived.request).toBe(customRequest)
    })

    it('is undefined for a non-custom intent with no prepared request', () => {
      const archived = buildArchivedTransaction({
        txId: 'tx',
        status: 'success',
        intent: { type: 'ens-renewal', name: 'leon', duration: 1n, from: FROM },
        timestamp: TIMESTAMP,
      })

      expect(archived.request).toBeUndefined()
    })

    it('carries the machine-prepared request for a non-custom intent', () => {
      // ens-renewal/eth-transfer intents have no embedded request; the machine
      // prepares one into ctx.request. The manager passes that prepared request
      // (ctx.request) here, so the archive must carry it rather than dropping
      // `to`/`value` from the history report.
      const archived = buildArchivedTransaction({
        txId: 'tx',
        status: 'success',
        request: customRequest,
        intent: { type: 'ens-renewal', name: 'leon', duration: 1n, from: FROM },
        timestamp: TIMESTAMP,
      })

      expect(archived.request).toBe(customRequest)
    })
  })
})

describe('retrying under the same transaction id', () => {
  const TX_HASH = `0x${'ab'.repeat(32)}` as Hash

  const signer: EOASigner = {
    type: 'eoa',
    walletClient: createWalletClient({
      account: FROM,
      chain: sepolia,
      transport: custom({
        request: async ({ method }) => {
          if (method === 'eth_chainId') return toHex(sepolia.id)
          if (method === 'eth_sendTransaction') return TX_HASH
          throw new Error(`unexpected RPC call: ${method}`)
        },
      }),
    }),
  }

  // A chain whose receipts come back with each of `statuses` in turn.
  const publicClientWith = (statuses: TransactionReceipt['status'][]) =>
    ({
      waitForTransactionReceipt: async () => ({
        status: statuses.shift(),
        transactionHash: TX_HASH,
        blockNumber: 1n,
      }),
    }) as unknown as PublicClient

  afterEach(() => transactionManager.clear())

  // The transaction modal's "Try again" re-runs a failed step under the same
  // id, so the successful retry must still be archived and reported.
  it('archives the retry of a failed run as well as the failure', async () => {
    const archived: ArchivedTransaction[] = []
    const unsubscribe = transactionManager.onTransactionArchived((tx) => {
      archived.push(tx)
    })
    const publicClient = publicClientWith(['reverted', 'success'])
    const start = () =>
      transactionManager.startTransaction(customRequest, signer, {
        id: 'tx-retry',
        publicClient,
      })

    await expect(waitForTransaction(start())).rejects.toBeDefined()
    await expect(waitForTransaction(start())).resolves.toMatchObject({
      hash: TX_HASH,
    })
    unsubscribe()

    expect(archived.map(({ txId, status }) => [txId, status])).toEqual([
      ['tx-retry', 'error'],
      ['tx-retry', 'success'],
    ])
  })
})

describe('automatic submission retry', () => {
  const TX_HASH = `0x${'cd'.repeat(32)}` as Hash

  // A wallet whose first `failures` eth_sendTransaction calls fail transiently.
  const flakySigner = (failures = 1): EOASigner => {
    let sends = 0
    return {
      type: 'eoa',
      walletClient: createWalletClient({
        account: FROM,
        chain: sepolia,
        transport: custom(
          {
            request: async ({ method }) => {
              if (method === 'eth_chainId') return toHex(sepolia.id)
              if (method === 'eth_sendTransaction') {
                sends += 1
                if (sends <= failures) throw new Error('socket hang up')
                return TX_HASH
              }
              throw new Error(`unexpected RPC call: ${method}`)
            },
          },
          { retryCount: 0 },
        ),
      }),
    }
  }

  const publicClient = {
    waitForTransactionReceipt: async () => ({
      status: 'success',
      transactionHash: TX_HASH,
      blockNumber: 1n,
    }),
  } as unknown as PublicClient

  afterEach(() => transactionManager.clear())

  it('does not carry the failed attempt error into a successful run', async () => {
    const archived: ArchivedTransaction[] = []
    const unsubscribe = transactionManager.onTransactionArchived((tx) => {
      archived.push(tx)
    })

    const txId = transactionManager.startTransaction(
      customRequest,
      flakySigner(),
      { id: 'tx-auto-retry', publicClient, retryDelay: 0 },
    )
    await expect(waitForTransaction(txId)).resolves.toMatchObject({
      hash: TX_HASH,
    })
    unsubscribe()

    const snapshot = transactionManager.getTransaction(txId)?.getSnapshot()
    expect(snapshot?.value).toBe('success')
    expect(snapshot?.context.retryCount).toBe(1)
    expect(snapshot?.context.error).toBeUndefined()

    expect(archived).toHaveLength(1)
    expect(archived[0]).toMatchObject({ txId, status: 'success' })
    expect(archived[0].error).toBeUndefined()
  })

  // WEB-1229: the local history record is written from the same snapshot as
  // the archived payload, but through a separate store the test above does
  // not read.
  it('archives a local history record with no error for a retried success', async () => {
    const txId = transactionManager.startTransaction(
      customRequest,
      flakySigner(),
      { id: 'tx-auto-retry-history', publicClient, retryDelay: 0 },
    )
    await waitForTransaction(txId)

    await vi.waitFor(async () => {
      const record = (await getTransactionHistory()).find(
        ({ id }) => id === txId,
      )
      expect(record).toMatchObject({ state: 'success', hash: TX_HASH })
      expect(record?.context.error).toBeUndefined()
    })
  })

  // Guard: the fix clears the error only once a hash arrives. A submission
  // that runs out of retries still ends in `error` and keeps its message.
  it('keeps the error of a submission that never lands', async () => {
    const archived: ArchivedTransaction[] = []
    const unsubscribe = transactionManager.onTransactionArchived((tx) => {
      archived.push(tx)
    })

    const txId = transactionManager.startTransaction(
      customRequest,
      flakySigner(Number.POSITIVE_INFINITY),
      {
        id: 'tx-auto-retry-exhausted',
        publicClient,
        retryDelay: 0,
        retryCount: 2,
      },
    )
    await expect(waitForTransaction(txId)).rejects.toThrow()
    unsubscribe()

    const snapshot = transactionManager.getTransaction(txId)?.getSnapshot()
    expect(snapshot?.matches('error')).toBe(true)
    expect(snapshot?.context.retryCount).toBe(2)
    expect(snapshot?.context.error?.message).toMatch(/socket hang up/)

    expect(archived).toHaveLength(1)
    expect(archived[0]).toMatchObject({ txId, status: 'error' })
    expect(archived[0].error).toMatch(/socket hang up/)
    await vi.waitFor(async () => {
      const record = (await getTransactionHistory()).find(
        ({ id }) => id === txId,
      )
      expect(record?.context.error).toMatch(/socket hang up/)
    })
  })
})
