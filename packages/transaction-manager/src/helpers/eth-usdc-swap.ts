/**
 * Exact-output USDC funding through CoW Protocol.
 *
 * Native ETH uses EthFlow. ERC-20s use a gasless CoW order after ensuring the
 * Vault Relayer has the exact allowance required by the refreshed quote. The
 * receiver can be either the user's EOA or their ENS smart account.
 */

import {
  type EnrichedOrder,
  ETH_ADDRESS,
  getTradeParametersAfterQuote,
  OrderBookApi,
  OrderKind,
  postSellNativeCurrencyOrder,
  type QuoteResults,
  SupportedChainId,
  swapParamsToLimitOrderParams,
  TradingSdk,
} from '@cowprotocol/cow-sdk'
import { ViemAdapter } from '@cowprotocol/sdk-viem-adapter'
import { getDestinationContracts } from '@ens-apps/smart-account'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, fromPromise, ok, type Result } from 'neverthrow'
import type { Address, Hash, PublicClient, WalletClient } from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'

const APP_CODE = 'Graze ENS'
const USDC_DECIMALS = 6
const ORDER_VALID_FOR_SECONDS = 20 * 60
const SLIPPAGE_BPS = 200
const BPS = 10_000n

export const ETH_SWAP_DISPLAYED_DRIFT_BPS = 300n

const divCeil = (numerator: bigint, denominator: bigint): bigint =>
  (numerator + denominator - 1n) / denominator

export const withBps = (value: bigint, bps: bigint): bigint =>
  divCeil(value * (BPS + bps), BPS)

export class EthSwapUnavailableError extends TaggedError(
  'EthSwapUnavailableError',
)<{ message: string; cause?: unknown }> {}

export class EthSwapRejectedError extends TaggedError('EthSwapRejectedError')<{
  message: string
}> {}

export type CowSellToken = Readonly<{
  address: Address
  symbol: string
  decimals: number
  isNative: boolean
}>

export const NATIVE_ETH: CowSellToken = {
  address: ETH_ADDRESS as Address,
  symbol: 'ETH',
  decimals: 18,
  isNative: true,
}

export type CowSwapQuote = Readonly<{
  /** Exact USDC amount the receiver must get. */
  amountOut: bigint
  /** Maximum sell-token amount, including quote costs and slippage. */
  maximumSell: bigint
  /** Native-ETH compatibility alias; equal to `maximumSell`. */
  maximumEth: bigint
  /** Quote validity used by the order. */
  validTo: number
}>

/** Backwards-compatible alias while registration persistence is migrated. */
export type EthSwapQuote = CowSwapQuote

export type CowSwapOrder = Readonly<{
  orderId: string
  validTo: number
  kind: 'native' | 'erc20'
  /** EthFlow creation transaction. ERC-20 orders are posted off-chain. */
  hash?: Hash
}>

/** Backwards-compatible alias while registration persistence is migrated. */
export type CowEthOrder = CowSwapOrder

const asSupportedChain = (
  chainId: number,
): Result<SupportedChainId, EthSwapUnavailableError> =>
  chainId === SupportedChainId.MAINNET || chainId === SupportedChainId.SEPOLIA
    ? ok(chainId)
    : err(
        new EthSwapUnavailableError({
          message: 'Paying with this token is not available on this network.',
        }),
      )

const tradeParameters = (params: {
  chainId: SupportedChainId
  owner: Address
  receiver: Address
  amountOut: bigint
  sellToken: CowSellToken
}) => ({
  chainId: params.chainId,
  appCode: APP_CODE,
  owner: params.owner,
  kind: OrderKind.BUY,
  sellToken: params.sellToken.isNative ? ETH_ADDRESS : params.sellToken.address,
  sellTokenDecimals: params.sellToken.decimals,
  buyToken: getDestinationContracts(params.chainId).usdc,
  buyTokenDecimals: USDC_DECIMALS,
  amount: params.amountOut.toString(),
  receiver: params.receiver,
  validFor: ORDER_VALID_FOR_SECONDS,
  slippageBps: SLIPPAGE_BPS,
})

const createCowClients = (params: {
  publicClient: PublicClient
  chainId: SupportedChainId
  walletClient?: WalletClient
}) => {
  const orderBookApi = new OrderBookApi({ chainId: params.chainId })
  const adapter = new ViemAdapter({
    provider: params.publicClient,
    ...(params.walletClient ? { walletClient: params.walletClient } : {}),
  })
  const sdk = new TradingSdk(
    { chainId: params.chainId, appCode: APP_CODE },
    { orderBookApi },
    adapter,
  )
  return { orderBookApi, sdk }
}

const toQuote = (amountOut: bigint, result: QuoteResults): CowSwapQuote => ({
  amountOut,
  maximumSell: BigInt(result.orderToSign.sellAmount),
  maximumEth: BigInt(result.orderToSign.sellAmount),
  validTo: result.orderToSign.validTo,
})

/** Quote buying the exact USDC funding requirement with any CoW sell token. */
export const quoteCowSwap = ResultFn(async function* (params: {
  readonly publicClient: PublicClient
  readonly chainId: number
  readonly owner: Address
  readonly receiver: Address
  readonly amountOut: bigint
  readonly sellToken: CowSellToken
}) {
  const chainId = yield* asSupportedChain(params.chainId)
  const { sdk } = createCowClients({
    publicClient: params.publicClient,
    chainId,
  })
  const result = yield* fromPromise(
    sdk.getQuoteOnly(
      tradeParameters({
        chainId,
        owner: params.owner,
        receiver: params.receiver,
        amountOut: params.amountOut,
        sellToken: params.sellToken,
      }),
    ),
    (cause) =>
      new EthSwapUnavailableError({
        message: `CoW Protocol could not quote payment with ${params.sellToken.symbol}.`,
        cause,
      }),
  )
  return ok(toQuote(params.amountOut, result))
})

/** Backwards-compatible native-ETH quote helper. */
export const quoteEthSwap = (
  params: Omit<Parameters<typeof quoteCowSwap>[0], 'sellToken'>,
) => quoteCowSwap({ ...params, sellToken: NATIVE_ETH })

const waitForSuccessfulReceipt = async (
  publicClient: PublicClient,
  hash: Hash,
  message: string,
) => {
  const receipt = await waitForTransactionReceipt(publicClient, { hash })
  if (receipt.status !== 'success') throw new Error(message)
}

/**
 * Ensure an ERC-20 can fund the order. Approval is exact, not unlimited.
 * Tokens such as USDT that reject changing a non-zero allowance directly are
 * reset to zero first.
 */
const ensureCowAllowance = async (params: {
  sdk: TradingSdk
  publicClient: PublicClient
  owner: Address
  sellToken: CowSellToken
  amount: bigint
}) => {
  const allowance = await params.sdk.getCowProtocolAllowance({
    tokenAddress: params.sellToken.address,
    owner: params.owner,
  })
  if (allowance >= params.amount) return
  if (allowance > 0n) {
    const resetHash = await params.sdk.approveCowProtocol({
      tokenAddress: params.sellToken.address,
      amount: 0n,
    })
    await waitForSuccessfulReceipt(
      params.publicClient,
      resetHash as Hash,
      `${params.sellToken.symbol} allowance reset failed on-chain.`,
    )
  }
  const approvalHash = await params.sdk.approveCowProtocol({
    tokenAddress: params.sellToken.address,
    amount: params.amount,
  })
  await waitForSuccessfulReceipt(
    params.publicClient,
    approvalHash as Hash,
    `${params.sellToken.symbol} approval failed on-chain.`,
  )
}

/** Refresh, price-check, authorize, sign, and post an exact-output CoW order. */
export const submitCowSwap = ResultFn(async function* (params: {
  readonly publicClient: PublicClient
  readonly walletClient: WalletClient
  readonly chainId: number
  readonly owner: Address
  readonly receiver: Address
  readonly amountOut: bigint
  readonly sellToken: CowSellToken
  /** Hard consent/solvency ceiling checked immediately before submission. */
  readonly maximumSell: bigint
}) {
  const chainId = yield* asSupportedChain(params.chainId)
  const { orderBookApi, sdk } = createCowClients({
    publicClient: params.publicClient,
    walletClient: params.walletClient,
    chainId,
  })
  const trade = tradeParameters({
    chainId,
    owner: params.owner,
    receiver: params.receiver,
    amountOut: params.amountOut,
    sellToken: params.sellToken,
  })
  const refreshed = yield* fromPromise(
    sdk.getQuoteOnly(trade),
    (cause) =>
      new EthSwapUnavailableError({
        message: `CoW Protocol could not refresh payment with ${params.sellToken.symbol}.`,
        cause,
      }),
  )
  const refreshedQuote = toQuote(params.amountOut, refreshed)
  if (refreshedQuote.maximumSell > params.maximumSell) {
    return err(
      new EthSwapRejectedError({
        message:
          'The price moved beyond the amount approved at checkout. Please quote again.',
      }),
    )
  }

  if (params.sellToken.isNative) {
    const limitOrder = swapParamsToLimitOrderParams(
      getTradeParametersAfterQuote({
        quoteParameters: refreshed.tradeParameters,
        sellToken: ETH_ADDRESS,
      }),
      refreshed.quoteResponse,
    )
    const posted = yield* fromPromise(
      postSellNativeCurrencyOrder(
        orderBookApi,
        refreshed.appDataInfo,
        limitOrder,
      ),
      (cause) =>
        new EthSwapUnavailableError({
          message: 'The CoW Protocol ETH order could not be submitted.',
          cause,
        }),
    )
    if (!posted.txHash) {
      return err(
        new EthSwapUnavailableError({
          message: 'The CoW Protocol ETH order has no transaction hash.',
        }),
      )
    }
    return ok({
      order: {
        orderId: posted.orderId,
        hash: posted.txHash as Hash,
        validTo: posted.orderToSign.validTo,
        kind: 'native',
      } satisfies CowSwapOrder,
      quote: refreshedQuote,
    })
  }

  yield* fromPromise(
    ensureCowAllowance({
      sdk,
      publicClient: params.publicClient,
      owner: params.owner,
      sellToken: params.sellToken,
      amount: refreshedQuote.maximumSell,
    }),
    (cause) =>
      new EthSwapUnavailableError({
        message: `${params.sellToken.symbol} could not be approved for CoW Protocol.`,
        cause,
      }),
  )

  // Approval can take long enough for the quote to move, so quote once more
  // and bind the order signature to that exact, re-checked result.
  const postable = yield* fromPromise(
    sdk.getQuote(trade),
    (cause) =>
      new EthSwapUnavailableError({
        message: `CoW Protocol could not prepare the ${params.sellToken.symbol} order.`,
        cause,
      }),
  )
  const quote = toQuote(params.amountOut, postable.quoteResults)
  if (quote.maximumSell > params.maximumSell) {
    return err(
      new EthSwapRejectedError({
        message:
          'The price moved beyond the checkout limit while approval confirmed. Please quote again.',
      }),
    )
  }
  const posted = yield* fromPromise(
    postable.postSwapOrderFromQuote(),
    (cause) =>
      new EthSwapUnavailableError({
        message: `The CoW Protocol ${params.sellToken.symbol} order could not be signed or submitted.`,
        cause,
      }),
  )
  return ok({
    order: {
      orderId: posted.orderId,
      validTo: postable.quoteResults.orderToSign.validTo,
      kind: 'erc20',
    } satisfies CowSwapOrder,
    quote,
  })
})

/** Backwards-compatible native-ETH submit helper. */
export const submitEthSwap = (
  params: Omit<
    Parameters<typeof submitCowSwap>[0],
    'sellToken' | 'maximumSell'
  > & { maximumEth: bigint },
) =>
  submitCowSwap({
    ...params,
    maximumSell: params.maximumEth,
    sellToken: NATIVE_ETH,
  })

/** Invalidate an expired EthFlow order and return its escrowed ETH. */
export const refundExpiredEthSwap = ResultFn(async function* (params: {
  readonly publicClient: PublicClient
  readonly walletClient: WalletClient
  readonly chainId: number
  readonly order: EnrichedOrder
}) {
  const chainId = yield* asSupportedChain(params.chainId)
  const { sdk } = createCowClients({
    publicClient: params.publicClient,
    walletClient: params.walletClient,
    chainId,
  })
  const hash = yield* fromPromise(
    sdk.onChainCancelOrder(
      { orderUid: params.order.uid, chainId, signer: params.walletClient },
      params.order,
    ),
    (cause) =>
      new EthSwapUnavailableError({
        message: 'The expired EthFlow order could not be refunded.',
        cause,
      }),
  )
  return ok(hash as Hash)
})
