import { errAsync, okAsync } from 'neverthrow'
import type { Address, Hash, PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isUserRejectionError } from '../../errors/transaction.errors'
import type { Signer } from '../../types/signer.types'
import {
  rejectEthSwap,
  swapEthForUsdcActor,
  usdcToBuy,
} from './registration.eth.actors'

const quoteEthSwap = vi.fn()
const submitEthSwap = vi.fn()
const refundExpiredEthSwap = vi.fn()
vi.mock('../../helpers/eth-usdc-swap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../helpers/eth-usdc-swap')>()),
  quoteEthSwap: (...args: unknown[]) => quoteEthSwap(...args),
  submitEthSwap: (...args: unknown[]) => submitEthSwap(...args),
  refundExpiredEthSwap: (...args: unknown[]) => refundExpiredEthSwap(...args),
}))

const readContract = vi.fn()
const getBalance = vi.fn()
const estimateFeesPerGas = vi.fn()
const waitForTransactionReceipt = vi.fn()
vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  readContract: (...args: unknown[]) => readContract(...args),
  getBalance: (...args: unknown[]) => getBalance(...args),
  estimateFeesPerGas: (...args: unknown[]) => estimateFeesPerGas(...args),
  waitForTransactionReceipt: (...args: unknown[]) =>
    waitForTransactionReceipt(...args),
}))

const getOrder = vi.fn()
vi.mock('@cowprotocol/cow-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@cowprotocol/cow-sdk')>()),
  OrderBookApi: class {
    getOrder = getOrder
  },
}))

const WALLET: Address = '0x1111111111111111111111111111111111111111'
const HCA: Address = '0x2222222222222222222222222222222222222222'
const SWAP_HASH: Hash = `0x${'de'.repeat(32)}`
const PENDING_HASH: Hash = `0x${'aa'.repeat(32)}`
const TARGET = 20_000_000n
const MAXIMUM_ETH = 10_000_000_000_000_000n
const ORDER = {
  orderId: 'cow-order-id',
  hash: SWAP_HASH,
  validTo: Math.floor(Date.now() / 1000) + 1_200,
}
const PENDING = { ...ORDER, orderId: 'pending-order', hash: PENDING_HASH }
const publicClient = { chain: sepolia } as unknown as PublicClient
const wallet = {
  type: 'eoa',
  walletClient: { account: { address: WALLET } },
} as unknown as Signer

const input = (
  overrides: Partial<Parameters<typeof swapEthForUsdcActor>[0]>,
) => ({
  hca: HCA,
  targetBalance: TARGET,
  funding: {},
  approvalSigner: wallet,
  publicClient,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  readContract.mockResolvedValue(0n)
  getBalance.mockResolvedValue(10n ** 18n)
  estimateFeesPerGas.mockResolvedValue({ maxFeePerGas: 1_000_000_000n })
  waitForTransactionReceipt.mockResolvedValue({ status: 'success' })
  getOrder.mockResolvedValue({ status: 'fulfilled' })
  quoteEthSwap.mockReturnValue(
    okAsync({
      amountOut: TARGET,
      maximumEth: MAXIMUM_ETH,
      validTo: ORDER.validTo,
    }),
  )
  submitEthSwap.mockReturnValue(
    okAsync({
      order: ORDER,
      quote: {
        amountOut: TARGET,
        maximumEth: MAXIMUM_ETH,
        validTo: ORDER.validTo,
      },
    }),
  )
  refundExpiredEthSwap.mockReturnValue(okAsync(PENDING_HASH))
})

describe('usdcToBuy', () => {
  it.each([
    [20n, 0n, 20n],
    [20n, 5n, 15n],
    [20n, 25n, 0n],
  ])('tops target %s up from %s with %s', (target, held, toBuy) => {
    expect(usdcToBuy(target, held)).toBe(toBuy)
  })
})

describe('rejectEthSwap', () => {
  const base = {
    maximumEth: 10_000n,
    walletBalance: 20_000n,
    gasReserve: 1_000n,
  }

  it('accepts a solvent quote inside the checkout bound', () => {
    expect(rejectEthSwap({ ...base, displayedCharge: 9_709n })).toBeUndefined()
  })

  it('refuses consent drift and insufficient gas', () => {
    expect(rejectEthSwap({ ...base, displayedCharge: 9_700n })).toBeDefined()
    expect(rejectEthSwap({ ...base, walletBalance: 10_999n })).toBeDefined()
  })
})

describe('swapEthForUsdcActor', () => {
  it('sends the exact HCA shortfall through CoW and reports the order', async () => {
    readContract.mockResolvedValue(5_000_000n)
    quoteEthSwap.mockReturnValueOnce(
      okAsync({
        amountOut: 15_000_000n,
        maximumEth: MAXIMUM_ETH,
        validTo: ORDER.validTo,
      }),
    )
    const onSwapSent = vi.fn()

    const result = await swapEthForUsdcActor(input({ onSwapSent }))

    expect(result._unsafeUnwrap()).toBe(15_000_000n)
    expect(quoteEthSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: WALLET,
        receiver: HCA,
        amountOut: 15_000_000n,
      }),
    )
    expect(onSwapSent).toHaveBeenCalledWith(ORDER)
    expect(getOrder).toHaveBeenCalledWith(ORDER.orderId)
  })

  it('does nothing when the HCA already holds the target budget', async () => {
    readContract.mockResolvedValue(TARGET)
    const result = await swapEthForUsdcActor(input({}))
    expect(result._unsafeUnwrap()).toBe(0n)
    expect(quoteEthSwap).not.toHaveBeenCalled()
    expect(submitEthSwap).not.toHaveBeenCalled()
  })

  it('settles an earlier order before reading the HCA and never funds twice', async () => {
    readContract.mockResolvedValue(TARGET)
    const result = await swapEthForUsdcActor(input({ pendingSwap: PENDING }))

    expect(result._unsafeUnwrap()).toBe(0n)
    expect(waitForTransactionReceipt).toHaveBeenCalledWith(publicClient, {
      hash: PENDING_HASH,
    })
    expect(getOrder).toHaveBeenCalledWith(PENDING.orderId)
    expect(submitEthSwap).not.toHaveBeenCalled()
  })

  it('refunds an expired order before opening its replacement', async () => {
    getOrder
      .mockResolvedValueOnce({ status: 'expired', uid: PENDING.orderId })
      .mockResolvedValueOnce({ status: 'fulfilled' })

    const result = await swapEthForUsdcActor(input({ pendingSwap: PENDING }))

    expect(result._unsafeUnwrap()).toBe(TARGET)
    expect(refundExpiredEthSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: sepolia.id,
        order: expect.objectContaining({ uid: PENDING.orderId }),
      }),
    )
    expect(submitEthSwap).toHaveBeenCalledOnce()
  })

  it('sends nothing when cancelled before the wallet prompt', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await swapEthForUsdcActor(
      input({ signal: controller.signal }),
    )
    expect(result.isErr()).toBe(true)
    expect(submitEthSwap).not.toHaveBeenCalled()
  })

  it('keeps a declined EthFlow transaction recognisable', async () => {
    submitEthSwap.mockReturnValueOnce(
      errAsync(
        Object.assign(new Error('User rejected the request.'), {
          name: 'UserRejectedRequestError',
        }),
      ),
    )
    const result = await swapEthForUsdcActor(input({}))
    expect(isUserRejectionError(result._unsafeUnwrapErr())).toBe(true)
  })

  it('does not submit when the quote exceeds what checkout showed', async () => {
    const result = await swapEthForUsdcActor(
      input({ funding: { displayedCharge: 9_000_000_000_000_000n } }),
    )
    expect(result._unsafeUnwrapErr().message).toContain('shown at checkout')
    expect(submitEthSwap).not.toHaveBeenCalled()
  })
})
