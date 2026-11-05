import { getDestinationContracts } from '@ens-apps/smart-account'
import type { Address, PublicClient, WalletClient } from 'viem'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type CowSellToken,
  quoteCowSwap,
  quoteEthSwap,
  refundExpiredEthSwap,
  submitCowSwap,
  submitEthSwap,
  withBps,
} from './eth-usdc-swap'

const {
  getQuoteOnly,
  getQuote,
  getCowProtocolAllowance,
  approveCowProtocol,
  postSwapOrderFromQuote,
  postSellNativeCurrencyOrder,
  getTradeParametersAfterQuote,
  swapParamsToLimitOrderParams,
  onChainCancelOrder,
  waitForTransactionReceipt,
  viemAdapterConstructor,
  getGlobalAdapter,
  getTokenPermitInfo,
  getPermitUtilsInstance,
  getTokenNonce,
  generatePermitHook,
  fetchPermitInfo,
} = vi.hoisted(() => ({
  getQuoteOnly: vi.fn(),
  getQuote: vi.fn(),
  getCowProtocolAllowance: vi.fn(),
  approveCowProtocol: vi.fn(),
  postSwapOrderFromQuote: vi.fn(),
  postSellNativeCurrencyOrder: vi.fn(),
  getTradeParametersAfterQuote: vi.fn(() => ({ quoted: true })),
  swapParamsToLimitOrderParams: vi.fn(() => ({ limit: true })),
  onChainCancelOrder: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  viemAdapterConstructor: vi.fn(),
  getGlobalAdapter: vi.fn(),
  getTokenPermitInfo: vi.fn(),
  getPermitUtilsInstance: vi.fn(),
  getTokenNonce: vi.fn(),
  generatePermitHook: vi.fn(),
  fetchPermitInfo: vi.fn(),
}))

vi.mock('@cowprotocol/cow-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@cowprotocol/cow-sdk')>()),
  TradingSdk: class {
    getQuoteOnly = getQuoteOnly
    getQuote = getQuote
    getCowProtocolAllowance = getCowProtocolAllowance
    approveCowProtocol = approveCowProtocol
    onChainCancelOrder = onChainCancelOrder
  },
  OrderBookApi: class {},
  getTradeParametersAfterQuote,
  swapParamsToLimitOrderParams,
  postSellNativeCurrencyOrder,
  getGlobalAdapter,
}))

vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  waitForTransactionReceipt,
}))

vi.mock('@cowprotocol/sdk-viem-adapter', () => ({
  ViemAdapter: class {
    constructor(options: unknown) {
      viemAdapterConstructor(options)
    }
  },
}))

vi.mock('@cowprotocol/permit-utils', () => ({
  generatePermitHook,
  getPermitUtilsInstance,
  getTokenPermitInfo,
  isSupportedPermitInfo: (value: { type?: string }) =>
    value.type === 'eip-2612' || value.type === 'dai-like',
}))

const WALLET: Address = '0x1111111111111111111111111111111111111111'
const HCA: Address = '0x2222222222222222222222222222222222222222'
const HASH = `0x${'ab'.repeat(32)}` as const
const APPROVAL_HASH = `0x${'cd'.repeat(32)}` as const
const HOOK_TARGET: Address = '0x3333333333333333333333333333333333333333'
const hooks = {
  pre: [
    { target: HOOK_TARGET, callData: '0x1234' as const, gasLimit: 100_000 },
  ],
  post: [{ target: HCA, callData: '0xabcd' as const, gasLimit: 200_000 }],
}
const USDC = getDestinationContracts(sepolia.id).usdc
const DAI: CowSellToken = {
  address: '0x68194a729C2450ad26072b3D33ADaCbcef39D574',
  symbol: 'DAI',
  decimals: 18,
  isNative: false,
}
const USDT: CowSellToken = { ...DAI, symbol: 'USDT' }
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
  vi.stubGlobal('fetch', fetchPermitInfo)
  fetchPermitInfo.mockResolvedValue({
    ok: true,
    json: async () => ({}),
  })
  getGlobalAdapter.mockImplementation(() => {
    throw new Error('Provider adapter is not configured')
  })
  getQuoteOnly.mockResolvedValue(quoteResult)
  postSwapOrderFromQuote.mockResolvedValue({ orderId: 'erc20-order-id' })
  getQuote.mockResolvedValue({
    quoteResults: quoteResult,
    postSwapOrderFromQuote,
  })
  getCowProtocolAllowance.mockResolvedValue(0n)
  getTokenPermitInfo.mockResolvedValue({ type: 'unsupported' })
  getTokenNonce.mockResolvedValue(0)
  getPermitUtilsInstance.mockResolvedValue({ getTokenNonce })
  generatePermitHook.mockResolvedValue({
    target: DAI.address,
    callData: '0xd505accf',
    gasLimit: '160000',
  })
  approveCowProtocol.mockResolvedValue(APPROVAL_HASH)
  waitForTransactionReceipt.mockResolvedValue({ status: 'success' })
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
      maximumSell: 10_500_000_000_000_000n,
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
      kind: 'native',
      amountOut: 20_000_000n,
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

describe('CoW ERC-20 funding', () => {
  it('quotes an exact USDC buy from the selected token', async () => {
    const result = await quoteCowSwap({
      publicClient,
      chainId: sepolia.id,
      owner: WALLET,
      receiver: HCA,
      amountOut: 20_000_000n,
      sellToken: DAI,
    })

    expect(result.isOk()).toBe(true)
    expect(getQuoteOnly).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'buy',
        sellToken: DAI.address,
        sellTokenDecimals: 18,
        buyToken: USDC,
        amount: '20000000',
        receiver: HCA,
      }),
    )
    expect(viemAdapterConstructor).toHaveBeenCalledOnce()
    expect(viemAdapterConstructor).toHaveBeenCalledWith({
      provider: publicClient,
    })
  })

  it('does not replace an adapter that is already configured while polling', async () => {
    getGlobalAdapter.mockReturnValue({})

    const result = await quoteCowSwap({
      publicClient,
      chainId: sepolia.id,
      owner: WALLET,
      receiver: HCA,
      amountOut: 20_000_000n,
      sellToken: DAI,
    })

    expect(result.isOk()).toBe(true)
    expect(viemAdapterConstructor).not.toHaveBeenCalled()
  })

  it('prices the CoW SDK permit hook at checkout', async () => {
    getTokenPermitInfo.mockResolvedValue({
      type: 'eip-2612',
      name: 'CoW Protocol Token',
      version: '1',
    })

    const result = await quoteCowSwap({
      publicClient,
      chainId: sepolia.id,
      owner: WALLET,
      receiver: HCA,
      amountOut: 20_000_000n,
      sellToken: { ...DAI, symbol: 'COW' },
    })

    expect(result.isOk()).toBe(true)
    expect(getQuoteOnly).toHaveBeenCalledTimes(2)
    expect(getQuoteOnly).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({
        appData: {
          metadata: {
            hooks: expect.objectContaining({
              pre: expect.arrayContaining([
                expect.objectContaining({ gasLimit: '160000' }),
              ]),
            }),
          },
        },
      }),
    )
  })

  it('prices the permit when an exact prior allowance does not cover checkout drift', async () => {
    getCowProtocolAllowance.mockResolvedValue(
      BigInt(quoteResult.orderToSign.sellAmount),
    )
    getTokenPermitInfo.mockResolvedValue({
      type: 'eip-2612',
      name: 'CoW Protocol Token',
      version: '1',
    })

    const result = await quoteCowSwap({
      publicClient,
      chainId: sepolia.id,
      owner: WALLET,
      receiver: HCA,
      amountOut: 20_000_000n,
      sellToken: { ...DAI, symbol: 'COW' },
    })

    expect(result.isOk()).toBe(true)
    expect(getQuoteOnly).toHaveBeenCalledTimes(2)
    expect(generatePermitHook).toHaveBeenCalledOnce()
  })

  it('omits the permit only when an existing allowance covers checkout drift', async () => {
    getCowProtocolAllowance.mockResolvedValue(
      withBps(BigInt(quoteResult.orderToSign.sellAmount), 300n),
    )
    getTokenPermitInfo.mockResolvedValue({
      type: 'eip-2612',
      name: 'CoW Protocol Token',
      version: '1',
    })

    const result = await quoteCowSwap({
      publicClient,
      chainId: sepolia.id,
      owner: WALLET,
      receiver: HCA,
      amountOut: 20_000_000n,
      sellToken: { ...DAI, symbol: 'COW' },
    })

    expect(result.isOk()).toBe(true)
    expect(getQuoteOnly).toHaveBeenCalledOnce()
    expect(generatePermitHook).not.toHaveBeenCalled()
  })

  it('fails checkout instead of silently omitting a supported permit hook', async () => {
    getTokenPermitInfo.mockResolvedValue({
      type: 'eip-2612',
      name: 'CoW Protocol Token',
      version: '1',
    })
    generatePermitHook.mockResolvedValue(undefined)

    const result = await quoteCowSwap({
      publicClient,
      chainId: sepolia.id,
      owner: WALLET,
      receiver: HCA,
      amountOut: 20_000_000n,
      sellToken: { ...DAI, symbol: 'COW' },
    })

    expect(result.isErr()).toBe(true)
    expect(getQuoteOnly).toHaveBeenCalledOnce()
  })

  it('approves only the refreshed maximum and posts a gasless order', async () => {
    const result = await submitCowSwap({
      publicClient,
      walletClient,
      chainId: sepolia.id,
      owner: WALLET,
      receiver: HCA,
      amountOut: 20_000_000n,
      sellToken: DAI,
      maximumSell: 11_000_000_000_000_000n,
    })

    expect(result._unsafeUnwrap().order).toEqual({
      orderId: 'erc20-order-id',
      validTo: 1_800_000_000,
      kind: 'erc20',
      amountOut: 20_000_000n,
    })
    expect(approveCowProtocol).toHaveBeenCalledWith({
      tokenAddress: DAI.address,
      amount: 10_500_000_000_000_000n,
    })
    expect(waitForTransactionReceipt).toHaveBeenCalledWith(publicClient, {
      hash: APPROVAL_HASH,
    })
    expect(viemAdapterConstructor).toHaveBeenCalledOnce()
    expect(viemAdapterConstructor).toHaveBeenCalledWith({
      provider: publicClient,
      walletClient,
    })
    expect(postSwapOrderFromQuote).toHaveBeenCalledOnce()
  })

  it('does not ask for another approval when allowance is sufficient', async () => {
    getCowProtocolAllowance.mockResolvedValue(10_500_000_000_000_000n)

    const result = await submitCowSwap({
      publicClient,
      walletClient,
      chainId: sepolia.id,
      owner: WALLET,
      receiver: HCA,
      amountOut: 20_000_000n,
      sellToken: DAI,
      maximumSell: 11_000_000_000_000_000n,
    })

    expect(result.isOk()).toBe(true)
    expect(approveCowProtocol).not.toHaveBeenCalled()
    expect(postSwapOrderFromQuote).toHaveBeenCalledOnce()
  })

  it('uses a bounded CoW permit hook without revoking an existing COW allowance', async () => {
    getCowProtocolAllowance.mockResolvedValue(1n)
    getTokenPermitInfo.mockResolvedValue({
      type: 'eip-2612',
      name: 'CoW Protocol Token',
      version: '1',
    })

    const result = await submitCowSwap({
      publicClient,
      walletClient,
      chainId: sepolia.id,
      owner: WALLET,
      receiver: HCA,
      amountOut: 20_000_000n,
      sellToken: { ...DAI, symbol: 'COW' },
      maximumSell: 11_000_000_000_000_000n,
      hooks,
    })

    expect(result.isOk()).toBe(true)
    expect(generatePermitHook).toHaveBeenCalledWith(
      expect.objectContaining({
        account: WALLET,
        amount: 16_500_000_000_000_000n,
        nonce: 0,
      }),
    )
    expect(approveCowProtocol).not.toHaveBeenCalled()
    expect(getQuote).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        appData: {
          metadata: {
            hooks: expect.objectContaining({
              pre: expect.arrayContaining([
                expect.objectContaining({
                  target: DAI.address,
                  callData: expect.stringMatching(/^0xd505accf/),
                  gasLimit: '160000',
                }),
              ]),
            }),
          },
        },
      }),
    )
    expect(postSwapOrderFromQuote).toHaveBeenCalledOnce()
  })

  it('does not mistake signed permit execution cost for market price movement', async () => {
    const signedPermitQuote = {
      ...quoteResult,
      orderToSign: {
        ...quoteResult.orderToSign,
        sellAmount: '14000000000000000',
      },
    }
    getCowProtocolAllowance.mockResolvedValue(0n)
    getTokenPermitInfo.mockResolvedValue({
      type: 'eip-2612',
      name: 'CoW Protocol Token',
      version: '1',
    })
    getQuoteOnly
      .mockResolvedValueOnce(quoteResult)
      .mockResolvedValueOnce(signedPermitQuote)
    getQuote.mockResolvedValue({
      quoteResults: signedPermitQuote,
      postSwapOrderFromQuote,
    })

    const result = await submitCowSwap({
      publicClient,
      walletClient,
      chainId: sepolia.id,
      owner: WALLET,
      receiver: HCA,
      amountOut: 20_000_000n,
      sellToken: { ...DAI, symbol: 'COW' },
      maximumSell: 11_000_000_000_000_000n,
      hooks,
    })

    expect(result.isOk()).toBe(true)
    expect(generatePermitHook).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 16_500_000_000_000_000n }),
    )
    expect(postSwapOrderFromQuote).toHaveBeenCalledOnce()
  })

  it('binds the same hooks into the quote and signed order app-data', async () => {
    getCowProtocolAllowance.mockResolvedValue(10_500_000_000_000_000n)

    const result = await submitCowSwap({
      publicClient,
      walletClient,
      chainId: sepolia.id,
      owner: WALLET,
      receiver: HCA,
      amountOut: 20_000_000n,
      sellToken: DAI,
      maximumSell: 11_000_000_000_000_000n,
      hooks,
    })

    expect(result.isOk()).toBe(true)
    const advancedSettings = {
      appData: {
        metadata: {
          hooks: {
            version: '0.2.0',
            pre: hooks.pre.map((hook) => ({
              ...hook,
              gasLimit: hook.gasLimit.toString(),
            })),
            post: hooks.post.map((hook) => ({
              ...hook,
              gasLimit: hook.gasLimit.toString(),
            })),
          },
        },
      },
    }
    expect(getQuoteOnly).toHaveBeenCalledWith(
      expect.any(Object),
      advancedSettings,
    )
    expect(getQuote).toHaveBeenCalledWith(expect.any(Object), advancedSettings)
    expect(postSwapOrderFromQuote).toHaveBeenCalledWith()
  })

  it('does not revoke a standard token allowance before increasing it', async () => {
    getCowProtocolAllowance.mockResolvedValue(1n)

    const result = await submitCowSwap({
      publicClient,
      walletClient,
      chainId: sepolia.id,
      owner: WALLET,
      receiver: HCA,
      amountOut: 20_000_000n,
      sellToken: DAI,
      maximumSell: 11_000_000_000_000_000n,
    })

    expect(result.isOk()).toBe(true)
    expect(approveCowProtocol).toHaveBeenCalledOnce()
    expect(approveCowProtocol).toHaveBeenCalledWith({
      tokenAddress: DAI.address,
      amount: 10_500_000_000_000_000n,
    })
  })

  it('resets only USDT-style non-zero allowance before changing it', async () => {
    getCowProtocolAllowance.mockResolvedValue(1n)
    approveCowProtocol
      .mockResolvedValueOnce(APPROVAL_HASH)
      .mockResolvedValueOnce(HASH)

    const result = await submitCowSwap({
      publicClient,
      walletClient,
      chainId: sepolia.id,
      owner: WALLET,
      receiver: HCA,
      amountOut: 20_000_000n,
      sellToken: USDT,
      maximumSell: 11_000_000_000_000_000n,
    })

    expect(result.isOk()).toBe(true)
    expect(approveCowProtocol).toHaveBeenNthCalledWith(1, {
      tokenAddress: DAI.address,
      amount: 0n,
    })
    expect(approveCowProtocol).toHaveBeenNthCalledWith(2, {
      tokenAddress: DAI.address,
      amount: 10_500_000_000_000_000n,
    })
  })
})

it('rounds consent bounds up', () => {
  expect(withBps(9_709n, 300n)).toBe(10_001n)
})
