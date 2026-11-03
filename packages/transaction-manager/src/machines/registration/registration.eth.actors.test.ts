import { getDestinationContracts, NATIVE_ETH } from '@ens-apps/smart-account'
import type { Address, Hash, PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Signer } from '../../types/signer.types'
import {
  depositEthActor,
  rejectEthDeposit,
  swapEthActor,
} from './registration.eth.actors'

const getBalance = vi.fn()
const readContract = vi.fn()
const estimateGas = vi.fn()
const estimateFeesPerGas = vi.fn()
const sendTransaction = vi.fn()
const waitForTransactionReceipt = vi.fn()
vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  getBalance: (...args: unknown[]) => getBalance(...args),
  readContract: (...args: unknown[]) => readContract(...args),
  estimateGas: (...args: unknown[]) => estimateGas(...args),
  estimateFeesPerGas: (...args: unknown[]) => estimateFeesPerGas(...args),
  sendTransaction: (...args: unknown[]) => sendTransaction(...args),
  waitForTransactionReceipt: (...args: unknown[]) =>
    waitForTransactionReceipt(...args),
}))

const WALLET: Address = '0x1111111111111111111111111111111111111111'
const HCA: Address = '0xaaaa000000000000000000000000000000000001'
const USDC = getDestinationContracts(sepolia.id).usdc
const DEPOSIT_HASH: Hash = `0x${'de'.repeat(32)}`
const PENDING_HASH: Hash = `0x${'aa'.repeat(32)}`
const NOW_S = BigInt(Math.floor(Date.now() / 1000))
const ETH_USD = 2_000_00000000n
const AMOUNT_OUT = 20_000_000n
// 20 USDC + the 2 USDC fee floor at $2,000.
const MAX_IN = 11_000_000_000_000_000n
const QUOTED_IN = 10_000_000_000_000_000n
const publicClient = { chain: sepolia } as unknown as PublicClient

type PrepareArgs = {
  sourceAssets: unknown
  auxiliaryFunds?: unknown
}

// Spends the exact input when one is set, else what sizing quotes.
const quoteFor = (args: PrepareArgs) => {
  const amountIn = Array.isArray(args.sourceAssets)
    ? (args.sourceAssets[0] as { amount: bigint }).amount
    : QUOTED_IN
  return {
    intentRoute: {
      intentOp: {
        sponsor: HCA,
        nonce: '77',
        expires: String(NOW_S + 300n),
        elements: [
          {
            chainId: String(sepolia.id),
            mandate: {
              recipient: HCA,
              destinationChainId: String(sepolia.id),
              destinationOps: { ops: [] },
              preClaimOps: { ops: [] },
            },
          },
        ],
      },
      intentCost: {
        tokensSpent: {
          [sepolia.id]: {
            [NATIVE_ETH]: { locked: '0', unlocked: amountIn.toString() },
          },
        },
        tokensReceived: [{ tokenAddress: USDC, destinationAmount: '20100000' }],
      },
    },
  }
}

const makeAccount = () => ({
  prepareTransaction: vi.fn(async (args: PrepareArgs) => quoteFor(args)),
  signTransaction: vi.fn(async (prepared: object) => prepared),
  submitTransaction: vi.fn(async () => ({ type: 'intent', id: 77n })),
  waitForExecution: vi.fn(async () => ({ fill: { hash: '0xfill' } })),
})

const signerFor = (account: ReturnType<typeof makeAccount>) =>
  ({
    type: 'rhinestone',
    account,
    config: { chain: sepolia },
  }) as unknown as Signer

const wallet = {
  type: 'eoa',
  walletClient: { account: { address: WALLET } },
} as unknown as Signer

/** HCA balance, then wallet balance, as the actors read them. */
const balances = (hca: bigint, walletBalance = 10n ** 18n) => {
  getBalance.mockImplementation(async (_client, { address }) =>
    address === HCA ? hca : walletBalance,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  readContract.mockResolvedValue([10n, ETH_USD, 0n, NOW_S - 60n, 10n])
  estimateGas.mockResolvedValue(21_000n)
  estimateFeesPerGas.mockResolvedValue({ maxFeePerGas: 1_000_000_000n })
  sendTransaction.mockResolvedValue(DEPOSIT_HASH)
  waitForTransactionReceipt.mockResolvedValue({ status: 'success' })
})

describe('rejectEthDeposit', () => {
  const base = {
    deposit: 10_000n,
    walletBalance: 20_000n,
    gasReserve: 1_000n,
  }

  it.each([
    ['nothing was shown', {}],
    ['it is within 3% of what was shown', { displayedCharge: 9_709n }],
    ['the wallet covers it and its fee exactly', { walletBalance: 11_000n }],
  ])('sends when %s', (_case, override) => {
    expect(rejectEthDeposit({ ...base, ...override })).toBeUndefined()
  })

  it.each([
    ['it exceeds what was shown by over 3%', { displayedCharge: 9_700n }],
    ['the wallet cannot also pay the fee', { walletBalance: 10_999n }],
  ])('refuses when %s', (_case, override) => {
    expect(rejectEthDeposit({ ...base, ...override })).toBeDefined()
  })
})

describe('depositEthActor', () => {
  const input = (account: ReturnType<typeof makeAccount>) => ({
    hca: HCA,
    amountOut: AMOUNT_OUT,
    funding: {},
    signer: signerFor(account),
    approvalSigner: wallet,
    publicClient,
  })

  it('sends the HCA the quoted ETH plus the buffer, reporting it before it confirms', async () => {
    balances(0n)
    const account = makeAccount()
    const onDepositSent = vi.fn()
    const result = await depositEthActor({ ...input(account), onDepositSent })

    expect(result._unsafeUnwrap()).toBe(10_150_000_000_000_000n)
    expect(account.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenRequests: [{ address: USDC, amount: AMOUNT_OUT }],
        auxiliaryFunds: { [sepolia.id]: { [NATIVE_ETH]: MAX_IN } },
      }),
    )
    expect(sendTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        to: HCA,
        value: 10_150_000_000_000_000n,
        chain: sepolia,
      }),
    )
    expect(onDepositSent).toHaveBeenCalledWith(DEPOSIT_HASH)
    expect(onDepositSent.mock.invocationCallOrder[0]).toBeLessThan(
      waitForTransactionReceipt.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('sends nothing when the HCA already holds enough ETH', async () => {
    balances(10_150_000_000_000_000n)
    const result = await depositEthActor(input(makeAccount()))
    expect(result._unsafeUnwrap()).toBe(0n)
    expect(sendTransaction).not.toHaveBeenCalled()
  })

  it('counts an earlier deposit before sizing a new one', async () => {
    balances(0n)
    await depositEthActor({
      ...input(makeAccount()),
      pendingDeposit: PENDING_HASH,
    })
    expect(waitForTransactionReceipt).toHaveBeenNthCalledWith(1, publicClient, {
      hash: PENDING_HASH,
    })
    expect(waitForTransactionReceipt.mock.invocationCallOrder[0]).toBeLessThan(
      getBalance.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('does not send more than checkout showed', async () => {
    balances(0n)
    const result = await depositEthActor({
      ...input(makeAccount()),
      funding: { displayedCharge: 9_000_000_000_000_000n },
    })
    expect(result._unsafeUnwrapErr().message).toContain('was shown at checkout')
    expect(sendTransaction).not.toHaveBeenCalled()
  })

  it('refuses a price feed it cannot trust, before quoting', async () => {
    balances(0n)
    readContract.mockResolvedValue([10n, ETH_USD, 0n, NOW_S - 90_000n, 10n])
    const account = makeAccount()
    const result = await depositEthActor(input(account))
    expect(result.isErr()).toBe(true)
    expect(account.prepareTransaction).not.toHaveBeenCalled()
  })

  it('reports a deposit that reverted', async () => {
    balances(0n)
    waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' })
    const result = await depositEthActor(input(makeAccount()))
    expect(result._unsafeUnwrapErr().message).toContain('failed on-chain')
  })
})

describe('swapEthActor', () => {
  const input = (account: ReturnType<typeof makeAccount>) => ({
    hca: HCA,
    amountOut: AMOUNT_OUT,
    signer: signerFor(account),
    publicClient,
  })

  it('swaps all the ETH the HCA holds, owner-signed, and waits for the fill', async () => {
    balances(10_150_000_000_000_000n)
    const account = makeAccount()
    const onSwapSubmitted = vi.fn()
    const result = await swapEthActor({ ...input(account), onSwapSubmitted })

    expect(result._unsafeUnwrap()).toBe('filled')
    expect(account.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceAssets: [
          {
            chain: sepolia,
            address: NATIVE_ETH,
            amount: 10_150_000_000_000_000n,
          },
        ],
        tokenRequests: [{ address: USDC }],
      }),
    )
    expect(account.prepareTransaction).toHaveBeenCalledWith(
      expect.not.objectContaining({ signers: expect.anything() }),
    )
    expect(onSwapSubmitted).toHaveBeenCalledWith({
      intentId: 77n,
      claimableUntil: Number(NOW_S + 300n) * 1_000,
    })
    expect(account.waitForExecution).toHaveBeenCalled()
  })

  it('swaps no more than the Chainlink bound', async () => {
    balances(5n * MAX_IN)
    const account = makeAccount()
    await swapEthActor(input(account))
    expect(account.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceAssets: [{ chain: sepolia, address: NATIVE_ETH, amount: MAX_IN }],
      }),
    )
  })

  it('settles an earlier swap that landed without swapping again', async () => {
    const account = makeAccount()
    const result = await swapEthActor({
      ...input(account),
      unsettledSwap: { intentId: 5n, claimableUntil: Date.now() + 60_000 },
      fetchIntentStatus: vi.fn(async () => 'COMPLETED'),
    })
    expect(result._unsafeUnwrap()).toBe('settled')
    expect(account.prepareTransaction).not.toHaveBeenCalled()
  })

  it('swaps anew once an earlier swap failed', async () => {
    balances(10_150_000_000_000_000n)
    const account = makeAccount()
    const result = await swapEthActor({
      ...input(account),
      unsettledSwap: { intentId: 5n, claimableUntil: Date.now() + 60_000 },
      fetchIntentStatus: vi.fn(async () => 'FAILED'),
    })
    expect(result._unsafeUnwrap()).toBe('filled')
    expect(account.submitTransaction).toHaveBeenCalledOnce()
  })

  it('keeps a swap whose submission went unanswered, so it is settled first', async () => {
    balances(10_150_000_000_000_000n)
    const account = makeAccount()
    account.submitTransaction.mockRejectedValueOnce(
      new TypeError('fetch failed'),
    )
    const onSwapSubmitted = vi.fn()
    const result = await swapEthActor({ ...input(account), onSwapSubmitted })
    expect(result.isErr()).toBe(true)
    expect(onSwapSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ intentId: 77n }),
    )
  })

  it('refuses when the HCA holds no ETH', async () => {
    balances(0n)
    const account = makeAccount()
    const result = await swapEthActor(input(account))
    expect(result._unsafeUnwrapErr().message).toContain('no ETH')
    expect(account.prepareTransaction).not.toHaveBeenCalled()
  })
})
