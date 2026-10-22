import {
  createWalletClient,
  custom,
  getAddress,
  type Hash,
  type Hex,
  type PublicClient,
  toHex,
} from 'viem'
import { sepolia } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SignerAddressMismatchError,
  TransactionSubmissionError,
  TransactionUserRejectedError,
} from '../errors/transaction.errors'
import { waitForTransaction } from '../helpers/waitForTransaction'
import { transactionManager } from '../providers/transactionManager'
import type { EOASigner } from '../types/signer.types'
import type { EOABatchTransactionRequest } from '../types/transaction.types'
import {
  getAtomicBatchSupport,
  submitEOABatch,
} from './eoa-batch-transport.actor'

const ACCOUNT = getAddress('0x000000000000000000000000000000000000aaaa')
const OTHER = getAddress('0x000000000000000000000000000000000000bbbb')
const TO = getAddress('0x000000000000000000000000000000000000cccc')
const TX_HASH = `0x${'ef'.repeat(32)}` as Hash
const CALLS_ID = `0x${'01'.repeat(32)}`

type RpcHandler = (method: string, params: unknown) => unknown

const signerWith = (handler: RpcHandler): EOASigner => ({
  type: 'eoa',
  walletClient: createWalletClient({
    account: ACCOUNT,
    chain: sepolia,
    transport: custom(
      {
        request: async ({ method, params }) => {
          if (method === 'eth_chainId') return toHex(sepolia.id)
          return handler(method, params)
        },
      },
      { retryCount: 0 },
    ),
  }),
})

const batchRequest = (
  from = ACCOUNT,
  calls: EOABatchTransactionRequest['calls'] = [
    { to: TO, data: '0x01', value: 0n },
    { to: TO, data: '0x02', value: 0n },
  ],
): EOABatchTransactionRequest => ({
  type: 'eoa-batch',
  from,
  chainId: sepolia.id,
  calls,
})

const callsStatus = (status: number, receiptStatus: Hex = '0x1') => ({
  version: '2.0.0',
  id: CALLS_ID,
  chainId: toHex(sepolia.id),
  atomic: true,
  status,
  receipts:
    status === 100
      ? []
      : [
          {
            logs: [],
            status: receiptStatus,
            blockHash: `0x${'00'.repeat(32)}`,
            blockNumber: '0x1',
            gasUsed: '0x5208',
            transactionHash: TX_HASH,
          },
        ],
})

afterEach(() => {
  transactionManager.clear()
  vi.clearAllMocks()
})

describe('getAtomicBatchSupport', () => {
  const capabilitiesWith = (atomic: unknown) =>
    signerWith((method) => {
      if (method === 'wallet_getCapabilities') {
        return { [toHex(sepolia.id)]: atomic ? { atomic } : {} }
      }
      throw new Error(`unexpected RPC call: ${method}`)
    }).walletClient

  it.each([
    ['supported', true],
    // `ready` would make our send prompt an EIP-7702 upgrade of the EOA.
    ['ready', false],
    ['unsupported', false],
  ])('reads atomic status %s as %s', async (status, expected) => {
    await expect(
      getAtomicBatchSupport({
        walletClient: capabilitiesWith({ status }),
        chainId: sepolia.id,
      }),
    ).resolves.toBe(expected)
  })

  it('is false when the wallet reports no atomic capability', async () => {
    await expect(
      getAtomicBatchSupport({
        walletClient: capabilitiesWith(undefined),
        chainId: sepolia.id,
      }),
    ).resolves.toBe(false)
  })

  it('is false when the wallet does not implement EIP-5792', async () => {
    const walletClient = signerWith(() => {
      throw new Error('Method not supported')
    }).walletClient
    await expect(
      getAtomicBatchSupport({ walletClient, chainId: sepolia.id }),
    ).resolves.toBe(false)
  })
})

describe('submitEOABatch', () => {
  it('sends every call as one atomic bundle and returns its id', async () => {
    const handler = vi.fn((method: string) => {
      if (method === 'wallet_sendCalls') return { id: CALLS_ID }
      throw new Error(`unexpected RPC call: ${method}`)
    })

    const result = await submitEOABatch({
      request: batchRequest(),
      signer: signerWith(handler),
    })

    expect(result._unsafeUnwrap()).toBe(CALLS_ID)
    const [, params] = handler.mock.calls[0] as unknown as [string, unknown[]]
    expect(params[0]).toMatchObject({
      atomicRequired: true,
      from: ACCOUNT,
      chainId: toHex(sepolia.id),
      calls: [
        { to: TO, data: '0x01' },
        { to: TO, data: '0x02' },
      ],
    })
  })

  it('refuses a bundle whose from is not the wallet account', async () => {
    const handler = vi.fn()
    const result = await submitEOABatch({
      request: batchRequest(OTHER),
      signer: signerWith(handler),
    })

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(SignerAddressMismatchError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('refuses an empty bundle', async () => {
    const result = await submitEOABatch({
      request: batchRequest(ACCOUNT, []),
      signer: signerWith(vi.fn()),
    })

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(TransactionSubmissionError)
  })

  it('maps a declined prompt to a user rejection', async () => {
    const rejection = Object.assign(new Error('User rejected the request.'), {
      code: 4001,
    })
    const result = await submitEOABatch({
      request: batchRequest(),
      signer: signerWith(() => {
        throw rejection
      }),
    })

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(
      TransactionUserRejectedError,
    )
  })
})

describe('eoa-batch through the transaction machine', () => {
  const publicClient = {
    waitForTransactionReceipt: async ({ hash }: { hash: Hash }) => ({
      status: 'success',
      transactionHash: hash,
      blockNumber: 1n,
    }),
  } as unknown as PublicClient

  const bundleSigner = (...statuses: number[]) =>
    signerWith((method) => {
      if (method === 'wallet_sendCalls') return { id: CALLS_ID }
      if (method === 'wallet_getCallsStatus') {
        return callsStatus(
          statuses.length > 1 ? (statuses.shift() ?? 200) : statuses[0],
        )
      }
      throw new Error(`unexpected RPC call: ${method}`)
    })

  it('resolves the bundle to the transaction that carried it', async () => {
    const txId = transactionManager.startTransaction(
      batchRequest(),
      bundleSigner(100, 200),
      { id: 'tx-batch', publicClient },
    )

    await expect(waitForTransaction(txId)).resolves.toMatchObject({
      hash: TX_HASH,
      receipt: { status: 'success' },
    })
    expect(
      transactionManager.getTransaction(txId)?.getSnapshot().context,
    ).toMatchObject({ callsId: CALLS_ID, hash: TX_HASH })
  })

  it('fails as reverted when the wallet reports the bundle failed', async () => {
    const txId = transactionManager.startTransaction(
      batchRequest(),
      bundleSigner(500),
      { id: 'tx-batch-failed', publicClient },
    )

    await expect(waitForTransaction(txId)).rejects.toThrow(/failed/)
    expect(
      transactionManager
        .getTransaction(txId)
        ?.getSnapshot()
        .matches({ error: 'reverted' }),
    ).toBe(true)
  })
})
