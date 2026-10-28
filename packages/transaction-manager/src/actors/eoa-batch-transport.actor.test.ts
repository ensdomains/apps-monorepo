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
  AtomicBatchUnsupportedError,
  CallsBundleTimeoutError,
  SignerAddressMismatchError,
  TransactionSubmissionError,
  TransactionUserRejectedError,
} from '../errors/transaction.errors'
import { waitForTransaction } from '../helpers/waitForTransaction'
import { transactionManager } from '../providers/transactionManager'
import type { EOASigner } from '../types/signer.types'
import type {
  EOABatchTransactionRequest,
  EOATransactionRequest,
} from '../types/transaction.types'
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

const signerWith = (handler: RpcHandler, account = ACCOUNT): EOASigner => ({
  type: 'eoa',
  walletClient: createWalletClient({
    account,
    chain: sepolia,
    pollingInterval: 10,
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

const capabilities = (status = 'supported') => ({
  [toHex(sepolia.id)]: { atomic: { status } },
})

const callsStatus = (
  status: number,
  receiptStatus: Hex = '0x1',
  hasReceipts = status !== 100,
) => ({
  version: '2.0.0',
  id: CALLS_ID,
  chainId: toHex(sepolia.id),
  atomic: true,
  status,
  receipts: !hasReceipts
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

  // `ready` makes our send upgrade the EOA through EIP-7702: only wallets whose
  // delegate can own an HCA may do that.
  it.each([
    ['supported', undefined, true],
    ['ready', 'io.metamask', true],
    ['ready', 'me.rainbow', true],
    ['ready', 'org.uniswap.app', true],
    ['ready', 'com.coinbase.wallet', false],
    ['ready', undefined, false],
    ['unsupported', 'io.metamask', false],
  ])(
    'reads atomic status %s from wallet %s as %s',
    async (status, walletId, expected) => {
      await expect(
        getAtomicBatchSupport({
          walletClient: capabilitiesWith({ status }),
          chainId: sepolia.id,
          walletId,
        }),
      ).resolves.toBe(expected)
    },
  )

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
      if (method === 'wallet_getCapabilities') return capabilities()
      if (method === 'wallet_sendCalls') return { id: CALLS_ID }
      throw new Error(`unexpected RPC call: ${method}`)
    })

    const result = await submitEOABatch({
      request: batchRequest(),
      signer: signerWith(handler),
    })

    expect(result._unsafeUnwrap()).toBe(CALLS_ID)
    const [, params] = handler.mock.calls.find(
      ([method]) => method === 'wallet_sendCalls',
    ) as unknown as [string, unknown[]]
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

  it('lets a wallet with an HCA-safe delegate upgrade through the send', async () => {
    const handler = vi.fn((method: string) => {
      if (method === 'wallet_getCapabilities') return capabilities('ready')
      if (method === 'wallet_sendCalls') return { id: CALLS_ID }
      throw new Error(`unexpected RPC call: ${method}`)
    })

    const result = await submitEOABatch({
      request: batchRequest(),
      signer: { ...signerWith(handler), walletId: 'io.metamask' },
    })

    expect(result._unsafeUnwrap()).toBe(CALLS_ID)
  })

  // Planned while the wallet reported `supported`; sending now could prompt
  // an EIP-7702 upgrade to a delegate we haven't vetted.
  it.each(['ready', 'unsupported'])(
    'refuses to send once the wallet reports atomic %s',
    async (status) => {
      const handler = vi.fn((method: string) => {
        if (method === 'wallet_getCapabilities') return capabilities(status)
        throw new Error(`unexpected RPC call: ${method}`)
      })

      const result = await submitEOABatch({
        request: batchRequest(),
        signer: signerWith(handler),
      })

      expect(result._unsafeUnwrapErr()).toBeInstanceOf(
        AtomicBatchUnsupportedError,
      )
      expect(handler).not.toHaveBeenCalledWith(
        'wallet_sendCalls',
        expect.anything(),
      )
    },
  )

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
      signer: signerWith((method) => {
        if (method === 'wallet_getCapabilities') return capabilities()
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
      if (method === 'wallet_getCapabilities') return capabilities()
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

  // Rainbow can answer `success` before it returns the receipts.
  it('keeps polling a successful bundle until its receipt arrives', async () => {
    const statuses = [callsStatus(200, '0x1', false), callsStatus(200)]
    const signer = signerWith((method) => {
      if (method === 'wallet_getCapabilities') return capabilities()
      if (method === 'wallet_sendCalls') return { id: CALLS_ID }
      if (method === 'wallet_getCallsStatus') {
        return statuses.length > 1 ? statuses.shift() : statuses[0]
      }
      throw new Error(`unexpected RPC call: ${method}`)
    })
    const txId = transactionManager.startTransaction(batchRequest(), signer, {
      id: 'tx-batch-late-receipt',
      publicClient,
    })

    await expect(waitForTransaction(txId)).resolves.toMatchObject({
      hash: TX_HASH,
    })
  })

  it('stops without resending when the user declines the account upgrade, and stops offering it', async () => {
    // Its own account: the decline is remembered for the rest of the file.
    const decliner = getAddress('0x000000000000000000000000000000000000dddd')
    const sendCalls = vi.fn(() => {
      throw Object.assign(new Error('Upgrade rejected'), { code: 5750 })
    })
    const signer: EOASigner = {
      ...signerWith((method) => {
        if (method === 'wallet_getCapabilities') return capabilities('ready')
        if (method === 'wallet_sendCalls') return sendCalls()
        throw new Error(`unexpected RPC call: ${method}`)
      }, decliner),
      walletId: 'io.metamask',
    }
    const txId = transactionManager.startTransaction(
      batchRequest(decliner),
      signer,
      { id: 'tx-batch-upgrade-declined', publicClient, retryDelay: 1 },
    )

    await expect(waitForTransaction(txId)).rejects.toBeInstanceOf(
      TransactionUserRejectedError,
    )
    expect(sendCalls).toHaveBeenCalledOnce()
    // Flows now plan separate transactions instead of asking again.
    await expect(
      getAtomicBatchSupport({
        walletClient: signer.walletClient,
        chainId: sepolia.id,
        walletId: 'io.metamask',
      }),
    ).resolves.toBe(false)
  })

  it('times out, keeping the bundle, when a success never brings a receipt', async () => {
    const signer = signerWith((method) => {
      if (method === 'wallet_getCapabilities') return capabilities()
      if (method === 'wallet_sendCalls') return { id: CALLS_ID }
      if (method === 'wallet_getCallsStatus') {
        return callsStatus(200, '0x1', false)
      }
      throw new Error(`unexpected RPC call: ${method}`)
    })
    const txId = transactionManager.startTransaction(batchRequest(), signer, {
      id: 'tx-batch-no-receipt',
      publicClient,
      timeout: 30,
    })

    await expect(waitForTransaction(txId)).rejects.toBeDefined()
    expect(transactionManager.hasTimedOutBundle(txId)).toBe(true)
  })

  it('resumes the accepted bundle when its step is restarted after a timeout', async () => {
    let isStatusAvailable = false
    const sendCalls = vi.fn(() => ({ id: CALLS_ID }))
    const signer = signerWith((method) => {
      if (method === 'wallet_getCapabilities') return capabilities()
      if (method === 'wallet_sendCalls') return sendCalls()
      if (method === 'wallet_getCallsStatus') {
        if (!isStatusAvailable) throw new Error('status unavailable')
        return callsStatus(200)
      }
      throw new Error(`unexpected RPC call: ${method}`)
    })
    const start = () =>
      transactionManager.startTransaction(batchRequest(), signer, {
        id: 'tx-batch-timeout',
        publicClient,
        timeout: 30,
      })

    await expect(waitForTransaction(start())).rejects.toBeDefined()
    expect(
      transactionManager
        .getTransaction('tx-batch-timeout')
        ?.getSnapshot()
        .matches({ error: 'timeout' }),
    ).toBe(true)

    // "Try again" restarts the step: it must wait on the same bundle, never
    // prompt for (and pay) a second one.
    isStatusAvailable = true
    const phases: string[] = []
    const unsubscribe = transactionManager.onRunTelemetryEvent(({ event }) =>
      phases.push(event.phase),
    )
    await expect(waitForTransaction(start())).resolves.toMatchObject({
      hash: TX_HASH,
    })
    unsubscribe()
    expect(sendCalls).toHaveBeenCalledOnce()
    // The resumed run reports under a fresh telemetry run.
    expect(phases).toContain('success')
  })
})

describe('a single call through the transaction machine', () => {
  const CONTRACT_CODE: Hex = '0x6080604052'
  const DELEGATED_CODE: Hex = `0xef0100${'12'.repeat(20)}`
  // Safe answers `eth_sendTransaction` with its safeTxHash, which no node has.
  const SAFE_TX_HASH = `0x${'5a'.repeat(32)}` as Hash

  const callRequest = (): EOATransactionRequest => ({
    type: 'eoa',
    from: ACCOUNT,
    chainId: sepolia.id,
    to: TO,
    data: '0x01',
    value: 0n,
  })

  const publicClientWith = (code: Hex | undefined) =>
    ({
      getCode: async () => code,
      waitForTransactionReceipt: async ({ hash }: { hash: Hash }) => {
        if (hash !== TX_HASH) throw new Error(`no receipt for ${hash}`)
        return { status: 'success', transactionHash: hash, blockNumber: 1n }
      },
      // A dry run of the call succeeds, as it would before the call lands.
      call: async () => ({ data: '0x' }),
      // Only the three reads the machine makes on this path; the rest of PublicClient is unused.
    }) as unknown as PublicClient

  const walletWith = (
    atomicStatus: string,
    bundleStatus = 200,
    sendTransactionHash = TX_HASH,
  ) => {
    const methods = vi.fn<(method: string) => void>()
    const signer = signerWith((method) => {
      methods(method)
      if (method === 'wallet_getCapabilities') return capabilities(atomicStatus)
      if (method === 'eth_sendTransaction') return sendTransactionHash
      if (method === 'wallet_sendCalls') return { id: CALLS_ID }
      if (method === 'wallet_getCallsStatus') return callsStatus(bundleStatus)
      throw new Error(`unexpected RPC call: ${method}`)
    })
    return { signer, methods }
  }

  it.each([
    ['an EOA', '0x', 'supported'],
    ['an EIP-7702-delegated EOA', DELEGATED_CODE, 'supported'],
    [
      'a contract account whose wallet cannot batch',
      CONTRACT_CODE,
      'unsupported',
    ],
  ] as const)('sends %s a plain transaction', async (_, code, atomicStatus) => {
    const { signer, methods } = walletWith(atomicStatus)
    const txId = transactionManager.startTransaction(callRequest(), signer, {
      id: 'tx-call-plain',
      publicClient: publicClientWith(code),
    })

    await expect(waitForTransaction(txId)).resolves.toMatchObject({
      hash: TX_HASH,
    })
    expect(methods).toHaveBeenCalledWith('eth_sendTransaction')
    expect(methods).not.toHaveBeenCalledWith('wallet_sendCalls')
  })

  it('sends a contract account a one-call bundle and settles on the transaction that carried it', async () => {
    const { signer, methods } = walletWith('supported', 200, SAFE_TX_HASH)
    const txId = transactionManager.startTransaction(callRequest(), signer, {
      id: 'tx-call-safe',
      publicClient: publicClientWith(CONTRACT_CODE),
      timeout: 200,
    })

    await expect(waitForTransaction(txId)).resolves.toMatchObject({
      hash: TX_HASH,
      receipt: { status: 'success' },
    })
    expect(methods).not.toHaveBeenCalledWith('eth_sendTransaction')
  })

  it('times out a pending one-call bundle instead of settling it on a dry run', async () => {
    const { signer } = walletWith('supported', 100)
    const txId = transactionManager.startTransaction(callRequest(), signer, {
      id: 'tx-call-safe-pending',
      publicClient: publicClientWith(CONTRACT_CODE),
      timeout: 30,
    })

    await expect(waitForTransaction(txId)).rejects.toBeInstanceOf(
      CallsBundleTimeoutError,
    )
    expect(transactionManager.hasTimedOutBundle(txId)).toBe(true)
  })
})
