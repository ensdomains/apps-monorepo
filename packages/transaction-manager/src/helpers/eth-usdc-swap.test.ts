import { getDestinationContracts } from '@ens-apps/smart-account'
import type { Address, PublicClient, WalletClient } from 'viem'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  quoteEthSwap,
  refundExpiredEthSwap,
  submitEthSwap,
  withBps,
} from './eth-usdc-swap'

const {
  getQuoteOnly,
  postSellNativeCurrencyOrder,
  getTradeParametersAfterQuote,
  swapParamsToLimitOrderParams,
  onChainCancelOrder,
} = vi.hoisted(() => ({
  getQuoteOnly: vi.fn(),
  postSellNativeCurrencyOrder: vi.fn(),
  getTradeParametersAfterQuote: vi.fn(() => ({ quoted: true })),
  swapParamsToLimitOrderParams: vi.fn(() => ({ limit: true })),
  onChainCancelOrder: vi.fn(),
}))

vi.mock('@cowprotocol/cow-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@cowprotocol/cow-sdk')>()),
  TradingSdk: class {
    getQuoteOnly = getQuoteOnly
    onChainCancelOrder = onChainCancelOrder
  },
  OrderBookApi: class {},
  getTradeParametersAfterQuote,
  swapParamsToLimitOrderParams,
  postSellNativeCurrencyOrder,
}))

vi.mock('@cowprotocol/sdk-viem-adapter', () => ({
  ViemAdapter: class {},
}))

const WALLET: Address = '0x1111111111111111111111111111111111111111'
const HCA: Address = '0x2222222222222222222222222222222222222222'
const HASH = `0x${'ab'.repeat(32)}` as const
const USDC = getDestinationContracts(sepolia.id).usdc
const publicClient = { chain: sepolia } as unknown as PublicClient
const walletClient = {
  account: { address: WALLET },
} as unknown as WalletClient

const quoteResult = {
  orderToSign: {
    sellAmount: '10500000000000000',
    validTo: 1_800_000_000,
  },
  tradeParameters: { kind: 'buy' },
  quoteResponse: { id: 42 },
  appDataInfo: { fullAppData: '{}', appDataKeccak256: `0x${'00'.repeat(32)}` },
}

beforeEach(() => {
  vi.clearAllMocks()
  getQuoteOnly.mockResolvedValue(quoteResult)
  postSellNativeCurrencyOrder.mockResolvedValue({
    orderId: 'cow-order-id',
    txHash: HASH,
    orderToSign: quoteResult.orderToSign,
  })
  onChainCancelOrder.mockResolvedValue(HASH)
})

describe('CoW ETH funding', () => {
  it('quotes an exact USDC buy with the HCA as receiver on Sepolia', async () => {
    const result = await quoteEthSwap({
      publicClient,
      chainId: sepolia.id,
      owner: WALLET,
      receiver: HCA,
      amountOut: 20_000_000n,
    })

    expect(result._unsafeUnwrap()).toEqual({
      amountOut: 20_000_000n,
      maximumEth: 10_500_000_000_000_000n,
      validTo: 1_800_000_000,
    })
    expect(getQuoteOnly).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'buy',
        sellToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        buyToken: USDC,
        amount: '20000000',
        owner: WALLET,
        receiver: HCA,
      }),
    )
  })

  it('submits the quoted EthFlow order and returns its recovery handle', async () => {
    const result = await submitEthSwap({
      publicClient,
      walletClient,
      chainId: sepolia.id,
      owner: WALLET,
      receiver: HCA,
      amountOut: 20_000_000n,
      maximumEth: 11_000_000_000_000_000n,
    })

    expect(result._unsafeUnwrap().order).toEqual({
      orderId: 'cow-order-id',
      hash: HASH,
      validTo: 1_800_000_000,
    })
    expect(postSellNativeCurrencyOrder).toHaveBeenCalledOnce()
  })

  it('does not call EthFlow when the refreshed quote crosses the hard ceiling', async () => {
    const result = await submitEthSwap({
      publicClient,
      walletClient,
      chainId: sepolia.id,
      owner: WALLET,
      receiver: HCA,
      amountOut: 20_000_000n,
      maximumEth: 10_000_000_000_000_000n,
    })

    expect(result.isErr()).toBe(true)
    expect(postSellNativeCurrencyOrder).not.toHaveBeenCalled()
  })

  it('supports only the ENS mainnet and Sepolia deployments', async () => {
    const result = await quoteEthSwap({
      publicClient,
      chainId: 10,
      owner: WALLET,
      receiver: HCA,
      amountOut: 1n,
    })
    expect(result.isErr()).toBe(true)
    expect(getQuoteOnly).not.toHaveBeenCalled()
  })

  it('uses the SDK on-chain cancellation to refund an expired EthFlow order', async () => {
    const order = { uid: 'cow-order-id' }
    const result = await refundExpiredEthSwap({
      publicClient,
      walletClient,
      chainId: sepolia.id,
      order: order as never,
    })

    expect(result._unsafeUnwrap()).toBe(HASH)
    expect(onChainCancelOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderUid: 'cow-order-id',
        chainId: sepolia.id,
      }),
      order,
    )
  })
})

it('rounds consent bounds up', () => {
  expect(withBps(9_709n, 300n)).toBe(10_001n)
})
