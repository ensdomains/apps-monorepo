/**
 * Native ETH funding through CoW Protocol's EthFlow.
 *
 * The quote is an exact-buy quote for the HCA's USDC shortfall and the HCA is
 * the receiver. The wallet therefore never receives the USDC and never needs
 * to sign a second funding permit. Mainnet and Sepolia use the same flow.
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

const APP_CODE = 'Graze ENS'
const USDC_DECIMALS = 6
const ETH_DECIMALS = 18
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

export type EthSwapQuote = Readonly<{
  /** Exact USDC amount the HCA must receive. */
  amountOut: bigint
  /** Maximum ETH committed to EthFlow, including quote costs and slippage. */
  maximumEth: bigint
  /** Quote validity used by the on-chain EthFlow order. */
  validTo: number
}>

export type CowEthOrder = Readonly<{
  orderId: string
  hash: Hash
  validTo: number
}>

const asSupportedChain = (
  chainId: number,
): Result<SupportedChainId, EthSwapUnavailableError> =>
  chainId === SupportedChainId.MAINNET || chainId === SupportedChainId.SEPOLIA
    ? ok(chainId)
    : err(
        new EthSwapUnavailableError({
          message: 'Paying with ETH is not available on this network.',
        }),
      )

const tradeParameters = (params: {
  chainId: SupportedChainId
  owner: Address
  receiver: Address
  amountOut: bigint
}) => ({
  chainId: params.chainId,
  appCode: APP_CODE,
  owner: params.owner,
  kind: OrderKind.BUY,
  sellToken: ETH_ADDRESS,
  sellTokenDecimals: ETH_DECIMALS,
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

const toQuote = (amountOut: bigint, result: QuoteResults): EthSwapQuote => ({
  amountOut,
  maximumEth: BigInt(result.orderToSign.sellAmount),
  validTo: result.orderToSign.validTo,
})

/** Quote buying the exact HCA shortfall with native ETH through CoW. */
export const quoteEthSwap = ResultFn(async function* (params: {
  readonly publicClient: PublicClient
  readonly chainId: number
  readonly owner: Address
  readonly receiver: Address
  readonly amountOut: bigint
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
      }),
    ),
    (cause) =>
      new EthSwapUnavailableError({
        message: 'CoW Protocol could not quote this ETH payment.',
        cause,
      }),
  )
  return ok(toQuote(params.amountOut, result))
})

/**
 * Submit the exact quote rather than asking the SDK to quote a second time.
 * This keeps the wallet transaction bound to the amount already checked by
 * Graze immediately before the prompt.
 */
export const submitEthSwap = ResultFn(async function* (params: {
  readonly publicClient: PublicClient
  readonly walletClient: WalletClient
  readonly chainId: number
  readonly owner: Address
  readonly receiver: Address
  readonly amountOut: bigint
  /** Hard consent/solvency ceiling checked before EthFlow is called. */
  readonly maximumEth: bigint
}) {
  const chainId = yield* asSupportedChain(params.chainId)
  const { orderBookApi, sdk } = createCowClients({
    publicClient: params.publicClient,
    walletClient: params.walletClient,
    chainId,
  })
  const quoteResult = yield* fromPromise(
    sdk.getQuoteOnly(
      tradeParameters({
        chainId,
        owner: params.owner,
        receiver: params.receiver,
        amountOut: params.amountOut,
      }),
    ),
    (cause) =>
      new EthSwapUnavailableError({
        message: 'CoW Protocol could not refresh this ETH payment.',
        cause,
      }),
  )
  const quote = toQuote(params.amountOut, quoteResult)
  if (quote.maximumEth > params.maximumEth) {
    return err(
      new EthSwapRejectedError({
        message:
          'The ETH price moved beyond the amount approved at checkout. Please quote again.',
      }),
    )
  }
  const limitOrder = swapParamsToLimitOrderParams(
    getTradeParametersAfterQuote({
      quoteParameters: quoteResult.tradeParameters,
      sellToken: ETH_ADDRESS,
    }),
    quoteResult.quoteResponse,
  )
  const posted = yield* fromPromise(
    postSellNativeCurrencyOrder(
      orderBookApi,
      quoteResult.appDataInfo,
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
    } satisfies CowEthOrder,
    quote,
  })
})

/**
 * Invalidate an expired EthFlow order on-chain. EthFlow returns the unspent
 * ETH to the owner as part of this transaction.
 */
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
      {
        orderUid: params.order.uid,
        chainId,
        signer: params.walletClient,
      },
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
