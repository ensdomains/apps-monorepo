import { getDestinationContracts } from '@ens-apps/smart-account'
import { errAsync, okAsync } from 'neverthrow'
import {
  type Address,
  decodeFunctionData,
  type Hash,
  type PublicClient,
  parseAbi,
} from 'viem'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isUserRejectionError } from '../../errors/transaction.errors'
import type { Signer } from '../../types/signer.types'
import {
  buildRegistrationCowHooks,
  quoteEthPaymentActor,
  rejectEthSwap,
  swapEthForUsdcActor,
  usdcToBuy,
} from './registration.eth.actors'

const quoteCowSwap = vi.fn()
const submitCowSwap = vi.fn()
const refundExpiredEthSwap = vi.fn()
vi.mock('../../helpers/eth-usdc-swap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../helpers/eth-usdc-swap')>()),
  quoteCowSwap: (...args: unknown[]) => quoteCowSwap(...args),
  submitCowSwap: (...args: unknown[]) => submitCowSwap(...args),
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
  kind: 'native' as const,
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
  quoteCowSwap.mockReturnValue(
    okAsync({
      amountOut: TARGET,
      maximumEth: MAXIMUM_ETH,
      maximumSell: MAXIMUM_ETH,
      validTo: ORDER.validTo,
    }),
  )
  submitCowSwap.mockReturnValue(
    okAsync({
      order: ORDER,
      quote: {
        amountOut: TARGET,
        maximumEth: MAXIMUM_ETH,
        maximumSell: MAXIMUM_ETH,
        validTo: ORDER.validTo,
      },
    }),
  )
  refundExpiredEthSwap.mockReturnValue(okAsync(PENDING_HASH))
})

describe('buildRegistrationCowHooks', () => {
  it('encodes the registrar permit before settlement and commit after it', () => {
    const registrar = getDestinationContracts(sepolia.id).ethRegistrar
    const permit = {
      owner: WALLET,
      spender: registrar,
      value: 5_500_000n,
      deadline: 1_800_000_000n,
      v: 27,
      r: `0x${'11'.repeat(32)}` as Hash,
      s: `0x${'22'.repeat(32)}` as Hash,
    }
    const commitment = `0x${'33'.repeat(32)}` as Hash
    const hooks = buildRegistrationCowHooks({
      chainId: sepolia.id,
      permit,
      commitment,
    })

    expect(hooks?.pre?.[0].target).toBe(
      getDestinationContracts(sepolia.id).usdc,
    )
    expect(hooks?.post?.[0].target).toBe(registrar)
    expect(
      decodeFunctionData({
        abi: parseAbi([
          'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
        ]),
        data: hooks?.pre?.[0].callData ?? '0x',
      }).args,
    ).toEqual([
      WALLET,
      registrar,
      5_500_000n,
      1_800_000_000n,
      27,
      permit.r,
      permit.s,
    ])
    expect(
      decodeFunctionData({
        abi: parseAbi(['function commit(bytes32 commitment)']),
        data: hooks?.post?.[0].callData ?? '0x',
      }).args,
    ).toEqual([commitment])
  })

  it('prices the same permit and commit work into an EOA checkout quote', async () => {
    const result = await quoteEthPaymentActor({
      owner: WALLET,
      hca: WALLET,
      permitValue: TARGET,
      publicClient,
      chainId: sepolia.id,
      includeRegistrationHooks: true,
    })

    expect(result.isOk()).toBe(true)
    expect(quoteCowSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: WALLET,
        receiver: WALLET,
        amountOut: TARGET,
        hooks: {
          pre: [expect.objectContaining({ gasLimit: 250_000 })],
          post: [expect.objectContaining({ gasLimit: 200_000 })],
        },
      }),
    )
  })
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
    readContract.mockResolvedValueOnce(5_000_000n).mockResolvedValueOnce(TARGET)
    quoteCowSwap.mockReturnValueOnce(
      okAsync({
        amountOut: 15_000_000n,
        maximumEth: MAXIMUM_ETH,
        maximumSell: MAXIMUM_ETH,
        validTo: ORDER.validTo,
      }),
    )
    const onSwapSent = vi.fn()

    const result = await swapEthForUsdcActor(input({ onSwapSent }))

    expect(result._unsafeUnwrap()).toBe(15_000_000n)
    expect(quoteCowSwap).toHaveBeenCalledWith(
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
    expect(quoteCowSwap).not.toHaveBeenCalled()
    expect(submitCowSwap).not.toHaveBeenCalled()
  })

  it('spends the selected token for an EOA even when the wallet already holds USDC', async () => {
    readContract.mockResolvedValue(TARGET * 10n)

    const result = await swapEthForUsdcActor(input({ fundingMode: 'exact' }))

    expect(result._unsafeUnwrap()).toBe(TARGET)
    expect(quoteCowSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: WALLET,
        receiver: HCA,
        amountOut: TARGET,
      }),
    )
    expect(submitCowSwap).toHaveBeenCalledOnce()
  })

  it('uses the fresh ERC-20 quote after checkout drift instead of failing after the registrar signature', async () => {
    const sellToken = {
      address: '0x3333333333333333333333333333333333333333' as Address,
      symbol: 'COW',
      decimals: 18,
      isNative: false,
    }
    readContract.mockResolvedValueOnce(10n ** 18n)

    const result = await swapEthForUsdcActor(
      input({
        fundingMode: 'exact',
        funding: {
          sellToken,
          // Deliberately far below the fresh quote. The final exact CoW order
          // signature, rather than this stale UI snapshot, authorizes spend.
          displayedCharge: MAXIMUM_ETH / 2n,
        },
      }),
    )

    expect(result.isOk()).toBe(true)
    expect(submitCowSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        sellToken,
        maximumSell: 10_300_000_000_000_000n,
      }),
    )
  })

  it('settles an earlier order before reading the HCA and never funds twice', async () => {
    readContract.mockResolvedValue(TARGET)
    const result = await swapEthForUsdcActor(input({ pendingSwap: PENDING }))

    expect(result._unsafeUnwrap()).toBe(0n)
    expect(waitForTransactionReceipt).toHaveBeenCalledWith(publicClient, {
      hash: PENDING_HASH,
    })
    expect(getOrder).toHaveBeenCalledWith(PENDING.orderId)
    expect(submitCowSwap).not.toHaveBeenCalled()
  })

  it('refunds an expired order before opening its replacement', async () => {
    getOrder
      .mockResolvedValueOnce({ status: 'expired', uid: PENDING.orderId })
      .mockResolvedValueOnce({ status: 'fulfilled' })
    readContract.mockResolvedValueOnce(0n).mockResolvedValueOnce(TARGET)

    const result = await swapEthForUsdcActor(input({ pendingSwap: PENDING }))

    expect(result._unsafeUnwrap()).toBe(TARGET)
    expect(refundExpiredEthSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: sepolia.id,
        order: expect.objectContaining({ uid: PENDING.orderId }),
      }),
    )
    expect(submitCowSwap).toHaveBeenCalledOnce()
  })

  it('sends nothing when cancelled before the wallet prompt', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await swapEthForUsdcActor(
      input({ signal: controller.signal }),
    )
    expect(result.isErr()).toBe(true)
    expect(submitCowSwap).not.toHaveBeenCalled()
  })

  it('keeps a declined EthFlow transaction recognisable', async () => {
    submitCowSwap.mockReturnValueOnce(
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
    expect(submitCowSwap).not.toHaveBeenCalled()
  })
})
