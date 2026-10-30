import {
  createWalletClient,
  custom,
  getAddress,
  type Hash,
  type Hex,
  type Log,
  type PublicClient,
  TransactionReceiptNotFoundError,
  toEventSelector,
  toHex,
} from 'viem'
import { sepolia } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Connector } from 'wagmi'
import { TransactionRevertedError } from '../errors/transaction.errors'
import { transactionManager } from '../providers/transactionManager'
import type { EOASigner } from '../types/signer.types'
import type { TransactionRequest } from '../types/transaction.types'
import { checkIsSafeWallet, findSafeExecution } from './safe-execution.helpers'
import { waitForTransaction } from './waitForTransaction'

const SAFE = getAddress('0x000000000000000000000000000000000000aaaa')
const TO = getAddress('0x000000000000000000000000000000000000cccc')
const TX_HASH = `0x${'ef'.repeat(32)}` as Hash
const SAFE_TX_HASH = `0x${'5a'.repeat(32)}` as Hash
const EXECUTION_SUCCESS = toEventSelector('ExecutionSuccess(bytes32,uint256)')
const EXECUTION_FAILURE = toEventSelector('ExecutionFailure(bytes32,uint256)')
const NO_PAYMENT: Hex = `0x${'00'.repeat(32)}`

type ExecutionLog = Pick<Log, 'topics' | 'data' | 'transactionHash'>

const wcConnector = (metadata?: {
  readonly name: string
  readonly url: string
}) =>
  ({
    type: 'walletConnect',
    getProvider: async () => ({
      session: metadata ? { peer: { metadata } } : undefined,
    }),
  }) as unknown as Connector

const SAFE_WALLET = wcConnector({
  name: 'Safe{Wallet}',
  url: 'https://app.safe.global/',
})
const OTHER_WALLET = wcConnector({ name: 'Rainbow', url: 'https://rainbow.me' })

/** Safe v1.4+ indexes the safeTxHash; v1.3 leaves it in the data. */
const executionLog = ({
  event = EXECUTION_SUCCESS,
  safeTxHash = SAFE_TX_HASH,
  isIndexed = true,
}: {
  readonly event?: Hex
  readonly safeTxHash?: Hash
  readonly isIndexed?: boolean
} = {}): ExecutionLog => ({
  topics: isIndexed ? [event, safeTxHash] : [event],
  data: isIndexed ? NO_PAYMENT : `${safeTxHash}${NO_PAYMENT.slice(2)}`,
  transactionHash: TX_HASH,
})

afterEach(() => {
  transactionManager.clear()
})

describe('checkIsSafeWallet', () => {
  it.each<[string, Connector | undefined, boolean]>([
    ['no connector', undefined, false],
    ['an injected wallet', { type: 'injected' } as unknown as Connector, false],
    ['WalletConnect without a session', wcConnector(), false],
    ['a Safe{Wallet} WalletConnect peer', SAFE_WALLET, true],
    ['another WalletConnect peer', OTHER_WALLET, false],
    [
      'a Safe-named peer on another origin',
      wcConnector({
        name: 'Safe{Wallet}',
        url: 'https://app.safe.global.evil.example',
      }),
      false,
    ],
  ])('%s', async (_, connector, expected) => {
    expect(await checkIsSafeWallet(connector)).toBe(expected)
  })
})

describe('findSafeExecution', () => {
  it.each([
    ['an indexed (v1.4+)', true],
    ['a data-encoded (v1.3)', false],
  ])('finds %s execution', (_, isIndexed) => {
    expect(
      findSafeExecution([executionLog({ isIndexed })], SAFE_TX_HASH),
    ).toEqual({ transactionHash: TX_HASH, isSuccess: true })
  })

  it('reports a failed execution', () => {
    expect(
      findSafeExecution(
        [executionLog({ event: EXECUTION_FAILURE })],
        SAFE_TX_HASH,
      ),
    ).toEqual({ transactionHash: TX_HASH, isSuccess: false })
  })

  it.each<[string, ExecutionLog]>([
    [
      "another transaction's execution",
      executionLog({ safeTxHash: `0x${'6b'.repeat(32)}` }),
    ],
    [
      'another event',
      executionLog({ event: toEventSelector('ChangedThreshold(uint256)') }),
    ],
  ])('ignores %s', (_, log) => {
    expect(findSafeExecution([log], SAFE_TX_HASH)).toBeUndefined()
  })
})

describe('a Safe through the transaction machine', () => {
  const signerWith = (
    handler: (method: string) => unknown,
    connector: Connector = SAFE_WALLET,
  ): EOASigner => ({
    type: 'eoa',
    connector,
    walletClient: createWalletClient({
      account: SAFE,
      chain: sepolia,
      pollingInterval: 10,
      transport: custom(
        {
          request: async ({ method }) =>
            method === 'eth_chainId' ? toHex(sepolia.id) : handler(method),
        },
        { retryCount: 0 },
      ),
    }),
  })

  const publicClientWith = ({
    logs = [],
  }: {
    readonly logs?: readonly ExecutionLog[]
  } = {}) => {
    const getLogs = vi.fn(async () => logs)
    // Only the carrying transaction has a receipt; a safeTxHash never gets one.
    const waitForTransactionReceipt = vi.fn(
      async ({ hash }: { hash: Hash }) => {
        if (hash !== TX_HASH) throw new Error(`no receipt for ${hash}`)
        return { status: 'success', transactionHash: hash, blockNumber: 1n }
      },
    )
    const publicClient = {
      pollingInterval: 5,
      getBlockNumber: async () => 1_000n,
      getLogs,
      waitForTransactionReceipt,
      getTransactionReceipt: async ({ hash }: { hash: Hash }) => {
        throw new TransactionReceiptNotFoundError({ hash })
      },
      // Only the reads the machine makes on these paths; the rest of PublicClient is unused.
    } as unknown as PublicClient
    return { publicClient, getLogs, waitForTransactionReceipt }
  }

  const callRequest: TransactionRequest = {
    type: 'eoa',
    from: SAFE,
    chainId: sepolia.id,
    to: TO,
    data: '0x01',
    value: 0n,
  }

  // Safe answers eth_sendTransaction with its safeTxHash, which no node has.
  const safeWallet = signerWith((method) => {
    if (method === 'eth_sendTransaction') return SAFE_TX_HASH
    throw new Error(`unexpected RPC call: ${method}`)
  })

  it('settles a call on the transaction that carried its safeTxHash', async () => {
    const txId = transactionManager.startTransaction(callRequest, safeWallet, {
      id: 'tx-safe-call',
      publicClient: publicClientWith({ logs: [executionLog()] }).publicClient,
    })

    await expect(waitForTransaction(txId)).resolves.toMatchObject({
      hash: TX_HASH,
      receipt: { status: 'success' },
    })
    // The transaction window links this hash.
    expect(
      transactionManager.getTransaction(txId)?.getSnapshot().context.hash,
    ).toBe(TX_HASH)
  })

  it('settles a batch whose status the Safe app never reports', async () => {
    const signer = signerWith((method) => {
      if (method === 'wallet_getCapabilities') {
        return { [toHex(sepolia.id)]: { atomic: { status: 'supported' } } }
      }
      if (method === 'wallet_sendCalls') return { id: SAFE_TX_HASH }
      // A closed Safe app never answers.
      if (method === 'wallet_getCallsStatus') return new Promise(() => {})
      throw new Error(`unexpected RPC call: ${method}`)
    })
    const txId = transactionManager.startTransaction(
      {
        type: 'eoa-batch',
        from: SAFE,
        chainId: sepolia.id,
        calls: [
          { to: TO, data: '0x01', value: 0n },
          { to: TO, data: '0x02', value: 0n },
        ],
      },
      signer,
      {
        id: 'tx-safe-batch',
        publicClient: publicClientWith({ logs: [executionLog()] }).publicClient,
      },
    )

    await expect(waitForTransaction(txId)).resolves.toMatchObject({
      hash: TX_HASH,
    })
  })

  it('fails as reverted once the failed execution is confirmed', async () => {
    const { publicClient, waitForTransactionReceipt } = publicClientWith({
      logs: [executionLog({ event: EXECUTION_FAILURE })],
    })
    const txId = transactionManager.startTransaction(callRequest, safeWallet, {
      id: 'tx-safe-call-failed',
      publicClient,
    })

    await expect(waitForTransaction(txId)).rejects.toBeInstanceOf(
      TransactionRevertedError,
    )
    expect(waitForTransactionReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ hash: TX_HASH }),
    )
  })

  it('stops reading logs once the run is cleared', async () => {
    const { publicClient, getLogs } = publicClientWith()
    transactionManager.startTransaction(callRequest, safeWallet, {
      id: 'tx-safe-call-cleared',
      publicClient,
    })
    await vi.waitFor(() => expect(getLogs).toHaveBeenCalled())

    transactionManager.clear()
    const callsAtClear = getLogs.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(getLogs).toHaveBeenCalledTimes(callsAtClear)
  })

  it("leaves another wallet's transaction to its receipt", async () => {
    const { publicClient, getLogs } = publicClientWith()
    const otherWallet = signerWith((method) => {
      if (method === 'eth_sendTransaction') return TX_HASH
      throw new Error(`unexpected RPC call: ${method}`)
    }, OTHER_WALLET)
    const txId = transactionManager.startTransaction(callRequest, otherWallet, {
      id: 'tx-other-wallet-call',
      publicClient,
    })

    await expect(waitForTransaction(txId)).resolves.toMatchObject({
      hash: TX_HASH,
    })
    expect(getLogs).not.toHaveBeenCalled()
  })
})
