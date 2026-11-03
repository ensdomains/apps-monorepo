import { getDestinationContracts } from '@ens-apps/smart-account'
import type { Address, Hash, PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Signer } from '../../types/signer.types'
import {
  rejectEthSwap,
  swapEthForUsdcActor,
  usdcToBuy,
} from './registration.eth.actors'

const readContract = vi.fn()
const simulateContract = vi.fn()
const getBalance = vi.fn()
const estimateGas = vi.fn()
const estimateFeesPerGas = vi.fn()
const sendTransaction = vi.fn()
const waitForTransactionReceipt = vi.fn()
vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  readContract: (...args: unknown[]) => readContract(...args),
  simulateContract: (...args: unknown[]) => simulateContract(...args),
  getBalance: (...args: unknown[]) => getBalance(...args),
  estimateGas: (...args: unknown[]) => estimateGas(...args),
  estimateFeesPerGas: (...args: unknown[]) => estimateFeesPerGas(...args),
  sendTransaction: (...args: unknown[]) => sendTransaction(...args),
  waitForTransactionReceipt: (...args: unknown[]) =>
    waitForTransactionReceipt(...args),
}))

const WALLET: Address = '0x1111111111111111111111111111111111111111'
const USDC = getDestinationContracts(sepolia.id).usdc
const ROUTER = '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E'
const SWAP_HASH: Hash = `0x${'de'.repeat(32)}`
const PENDING_HASH: Hash = `0x${'aa'.repeat(32)}`
const NOW_S = BigInt(Math.floor(Date.now() / 1000))
const ETH_USD = 2_000_00000000n
const PERMIT_VALUE = 20_000_000n
const QUOTED_IN = 10_000_000_000_000_000n
const publicClient = { chain: sepolia } as unknown as PublicClient
const wallet = {
  type: 'eoa',
  walletClient: { account: { address: WALLET } },
} as unknown as Signer

/** The wallet's USDC, and the feed's price, as the actor reads them. */
const reads = (walletUsdc: bigint, updatedAt = NOW_S - 60n) => {
  readContract.mockImplementation(async (_client, { functionName }) =>
    functionName === 'balanceOf'
      ? walletUsdc
      : [10n, ETH_USD, 0n, updatedAt, 10n],
  )
}

const input = (
  overrides: Partial<Parameters<typeof swapEthForUsdcActor>[0]>,
) => ({
  permitValue: PERMIT_VALUE,
  funding: {},
  approvalSigner: wallet,
  publicClient,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  reads(0n)
  // Every pool quotes the same; the cheapest-pool choice is tested on its own.
  simulateContract.mockResolvedValue({ result: [QUOTED_IN, 0n, 0, 0n] })
  getBalance.mockResolvedValue(10n ** 18n)
  estimateGas.mockResolvedValue(150_000n)
  estimateFeesPerGas.mockResolvedValue({ maxFeePerGas: 1_000_000_000n })
  sendTransaction.mockResolvedValue(SWAP_HASH)
  waitForTransactionReceipt.mockResolvedValue({ status: 'success' })
})

describe('usdcToBuy', () => {
  it.each([
    [20n, 0n, 20n],
    [20n, 5n, 15n],
    [20n, 25n, 0n],
  ])('buys %s less a held %s as %s', (permitValue, held, toBuy) => {
    expect(usdcToBuy(permitValue, held)).toBe(toBuy)
  })
})

describe('rejectEthSwap', () => {
  const base = {
    maximumEth: 10_000n,
    walletBalance: 20_000n,
    gasReserve: 1_000n,
  }

  it.each([
    ['nothing was shown', {}],
    ['it is within 3% of what was shown', { displayedCharge: 9_709n }],
    ['the wallet covers it and its fee exactly', { walletBalance: 11_000n }],
  ])('swaps when %s', (_case, override) => {
    expect(rejectEthSwap({ ...base, ...override })).toBeUndefined()
  })

  it.each([
    ['it exceeds what was shown by over 3%', { displayedCharge: 9_700n }],
    ['the wallet cannot also pay the fee', { walletBalance: 10_999n }],
  ])('refuses when %s', (_case, override) => {
    expect(rejectEthSwap({ ...base, ...override })).toBeDefined()
  })
})

describe('swapEthForUsdcActor', () => {
  it('buys what the wallet is short through Uniswap, reporting the swap before it confirms', async () => {
    reads(5_000_000n)
    // 15 USDC at the feed's $2,000.
    simulateContract.mockResolvedValue({
      result: [7_500_000_000_000_000n, 0n, 0, 0n],
    })
    const onSwapSent = vi.fn()
    const result = await swapEthForUsdcActor(input({ onSwapSent }))

    expect(result._unsafeUnwrap()).toBe(15_000_000n)
    expect(simulateContract.mock.calls[0]?.[1].args[0]).toMatchObject({
      tokenOut: USDC,
      amount: 15_000_000n,
    })
    expect(sendTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        to: ROUTER,
        value: 7_650_000_000_000_000n,
        chain: sepolia,
      }),
    )
    expect(onSwapSent).toHaveBeenCalledWith(SWAP_HASH)
    expect(onSwapSent.mock.invocationCallOrder[0]).toBeLessThan(
      waitForTransactionReceipt.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('swaps nothing when the wallet already holds the USDC', async () => {
    reads(PERMIT_VALUE)
    const result = await swapEthForUsdcActor(input({}))
    expect(result._unsafeUnwrap()).toBe(0n)
    expect(simulateContract).not.toHaveBeenCalled()
    expect(sendTransaction).not.toHaveBeenCalled()
  })

  it('counts an earlier swap before buying again', async () => {
    await swapEthForUsdcActor(input({ pendingSwap: PENDING_HASH }))
    expect(waitForTransactionReceipt).toHaveBeenNthCalledWith(1, publicClient, {
      hash: PENDING_HASH,
    })
    expect(waitForTransactionReceipt.mock.invocationCallOrder[0]).toBeLessThan(
      readContract.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('does not send more ETH than checkout showed', async () => {
    const result = await swapEthForUsdcActor(
      input({ funding: { displayedCharge: 9_000_000_000_000_000n } }),
    )
    expect(result._unsafeUnwrapErr().message).toContain('was shown at checkout')
    expect(sendTransaction).not.toHaveBeenCalled()
  })

  it('refuses a price feed it cannot trust, before quoting', async () => {
    reads(0n, NOW_S - 90_000n)
    const result = await swapEthForUsdcActor(input({}))
    expect(result.isErr()).toBe(true)
    expect(simulateContract).not.toHaveBeenCalled()
  })

  it('refuses when every pool prices ETH far below the feed', async () => {
    simulateContract.mockResolvedValue({
      result: [20_000_000_000_000_000n, 0n, 0, 0n],
    })
    const result = await swapEthForUsdcActor(input({}))
    expect(result._unsafeUnwrapErr().message).toContain('too high')
    expect(sendTransaction).not.toHaveBeenCalled()
  })

  it('reports a swap that reverted', async () => {
    waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' })
    const result = await swapEthForUsdcActor(input({}))
    expect(result._unsafeUnwrapErr().message).toContain('failed on-chain')
  })
})
