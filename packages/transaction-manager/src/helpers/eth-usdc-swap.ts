/**
 * Paying for a registration with ETH: the wallet buys the USDC it is short on
 * Uniswap v3, in one transaction that wraps the ETH, swaps it for an exact
 * USDC amount and refunds what it did not spend. The USDC then funds the HCA
 * through the usual EIP-2612 permit.
 *
 * Not Rhinestone: its swap venues are DEX aggregators, and none of them serves
 * a same-chain swap on any testnet (see `DEBUGGING_INTENTS.md` §10).
 *
 * Every quote is held to the Chainlink ETH/USD feed before the wallet is asked.
 * Adapted from #1679.
 */

import { getDestinationContracts } from '@ens-apps/smart-account'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, fromPromise, ok, type Result } from 'neverthrow'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  isAddressEqual,
  type PublicClient,
  parseAbi,
} from 'viem'
import { readContract, simulateContract } from 'viem/actions'

/** Uniswap v3 QuoterV2, SwapRouter02 and the WETH they route, by chain id. */
const UNISWAP_V3: Readonly<
  Record<
    number,
    {
      readonly quoter: Address
      readonly router: Address
      readonly weth: Address
    }
  >
> = {
  1: {
    quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  11155111: {
    quoter: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
    router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
  },
}

/** Chainlink ETH/USD aggregators, 8 decimals, by chain id. */
const ETH_USD_FEEDS: Readonly<
  Record<number, { readonly address: Address; readonly maxAgeSeconds: bigint }>
> = {
  // Heartbeat one hour; two allows for a late round.
  1: {
    address: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
    maxAgeSeconds: 7_200n,
  },
  // The testnet feed updates far less often.
  11155111: {
    address: '0x694AA1769357215DE4FAC081bf1f309aDC325306',
    maxAgeSeconds: 86_400n,
  },
}

const quoterAbi = parseAbi([
  'function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
])
const routerAbi = parseAbi([
  'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)',
  'function refundETH() payable',
  'function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)',
])
const ethUsdFeedAbi = parseAbi([
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
])

const POOL_FEES = [500, 3000, 10000] as const
type PoolFee = (typeof POOL_FEES)[number]

const BPS = 10_000n
/** What the swap may cost over its quote before it reverts. */
const SWAP_SLIPPAGE_BPS = 200n

/**
 * How far above the ETH shown at checkout the swap may still go. A larger
 * move asks the user to start again rather than spend what they did not see.
 */
export const ETH_SWAP_DISPLAYED_DRIFT_BPS = 300n

/** ETH has 18 decimals, USDC 6 and the feed 8: 10^(18 - 6 + 8). */
const USDC_TO_WEI_AT_FEED_SCALE = 10n ** 20n

const divCeil = (numerator: bigint, denominator: bigint): bigint =>
  (numerator + denominator - 1n) / denominator

/** `value` widened by `bps`, rounded up. */
export const withBps = (value: bigint, bps: bigint): bigint =>
  divCeil(value * (BPS + bps), BPS)

/**
 * The most a swap may cost over the USDC it delivers, at the Chainlink price:
 * 3%, at least 2 USDC. Covers the pool fee and the slippage allowance.
 */
export function ethSwapMaxFee(amountOut: bigint): bigint {
  const threePercent = (amountOut * 3n) / 100n
  return threePercent > 2_000_000n ? threePercent : 2_000_000n
}

/** The most ETH (wei) buying `amountOut` USDC may take, fee included. */
export function maxEthSwapInput(amountOut: bigint, ethUsd: bigint): bigint {
  return divCeil(
    (amountOut + ethSwapMaxFee(amountOut)) * USDC_TO_WEI_AT_FEED_SCALE,
    ethUsd,
  )
}

export type EthUsdRound = Readonly<{
  roundId: bigint
  answer: bigint
  updatedAt: bigint
  answeredInRound: bigint
}>

/** No swap can be offered: no feed, no trustworthy price, or no pool. */
export class EthSwapUnavailableError extends TaggedError(
  'EthSwapUnavailableError',
)<{ message: string; cause?: unknown }> {}

/** The pools price ETH too far from the Chainlink feed to swap now. */
export class EthSwapRejectedError extends TaggedError('EthSwapRejectedError')<{
  message: string
}> {}

/** The round's ETH/USD price (8 decimals), if it is a usable answer. */
export function validateEthUsdRound(
  round: EthUsdRound,
  nowSeconds: bigint,
  maxAgeSeconds: bigint,
): Result<bigint, EthSwapUnavailableError> {
  const isUsable =
    round.answer > 0n &&
    round.answeredInRound >= round.roundId &&
    round.updatedAt > 0n &&
    round.updatedAt <= nowSeconds &&
    nowSeconds - round.updatedAt <= maxAgeSeconds
  return isUsable
    ? ok(round.answer)
    : err(
        new EthSwapUnavailableError({
          message: 'The ETH price feed is unavailable. Try again later.',
        }),
      )
}

/** The Chainlink ETH/USD price (8 decimals), refused when stale or unusable. */
export const readEthUsdPrice = ResultFn(async function* (params: {
  readonly publicClient: PublicClient
  readonly chainId: number
  readonly nowSeconds: bigint
}) {
  const feed = ETH_USD_FEEDS[params.chainId]
  if (!feed) {
    return err(
      new EthSwapUnavailableError({
        message: 'Paying with ETH is not available on this network.',
      }),
    )
  }
  const [roundId, answer, , updatedAt, answeredInRound] = yield* fromPromise(
    readContract(params.publicClient, {
      address: feed.address,
      abi: ethUsdFeedAbi,
      functionName: 'latestRoundData',
    }),
    (cause) =>
      new EthSwapUnavailableError({
        message: 'The ETH price feed is unavailable. Try again later.',
        cause,
      }),
  )
  return validateEthUsdRound(
    { roundId, answer, updatedAt, answeredInRound },
    params.nowSeconds,
    feed.maxAgeSeconds,
  )
})

/** What `wei` is worth in USDC (6 decimals) at `ethUsd` (8 decimals), rounded down. */
export const ethToUsdcRaw = (wei: bigint, ethUsd: bigint): bigint =>
  (wei * ethUsd) / USDC_TO_WEI_AT_FEED_SCALE

/** A swap of ETH for exactly `amountOut` USDC through one Uniswap v3 pool. */
export type EthSwapQuote = Readonly<{
  amountOut: bigint
  /** What the pool quoted, in wei. */
  amountIn: bigint
  /** What the wallet sends: the quote plus slippage. Unused ETH is refunded. */
  maximumEth: bigint
  fee: PoolFee
}>

/**
 * The cheapest pool's quote, if it stays within the Chainlink bound even at
 * its slippage limit. A pool with no route quotes nothing and is skipped.
 */
export function selectEthSwapQuote(params: {
  readonly amountOut: bigint
  readonly maxAmountIn: bigint
  readonly poolQuotes: readonly { fee: PoolFee; amountIn: bigint }[]
}): Result<EthSwapQuote, EthSwapUnavailableError | EthSwapRejectedError> {
  const { amountOut, maxAmountIn, poolQuotes } = params
  const cheapest = poolQuotes
    .filter(({ amountIn }) => amountIn > 0n)
    .reduce<(typeof poolQuotes)[number] | undefined>(
      (best, quote) => (!best || quote.amountIn < best.amountIn ? quote : best),
      undefined,
    )
  if (!cheapest) {
    return err(
      new EthSwapUnavailableError({
        message: 'No ETH to USDC swap is available right now.',
      }),
    )
  }
  const maximumEth = withBps(cheapest.amountIn, SWAP_SLIPPAGE_BPS)
  if (maximumEth > maxAmountIn) {
    return err(
      new EthSwapRejectedError({
        message: 'The ETH exchange rate is too high. Try again later.',
      }),
    )
  }
  return ok({
    amountOut,
    amountIn: cheapest.amountIn,
    maximumEth,
    fee: cheapest.fee,
  })
}

/** Quote buying exactly `amountOut` USDC with ETH, held to the Chainlink price. */
export const quoteEthSwap = ResultFn(async function* (params: {
  readonly publicClient: PublicClient
  readonly chainId: number
  readonly amountOut: bigint
  readonly nowSeconds: bigint
}) {
  const uniswap = UNISWAP_V3[params.chainId]
  if (!uniswap) {
    return err(
      new EthSwapUnavailableError({
        message: 'Paying with ETH is not available on this network.',
      }),
    )
  }
  const ethUsd = yield* readEthUsdPrice(params)

  const usdc = getDestinationContracts(params.chainId).usdc
  // A pool that does not exist or cannot fill reverts; that pool is skipped.
  const settled = await Promise.allSettled(
    POOL_FEES.map(async (fee) => {
      // The quoter is not `view`: it reverts with the result, so simulate it.
      const { result } = await simulateContract(params.publicClient, {
        address: uniswap.quoter,
        abi: quoterAbi,
        functionName: 'quoteExactOutputSingle',
        args: [
          {
            tokenIn: uniswap.weth,
            tokenOut: usdc,
            amount: params.amountOut,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      })
      return { fee, amountIn: result[0] }
    }),
  )
  return selectEthSwapQuote({
    amountOut: params.amountOut,
    maxAmountIn: maxEthSwapInput(params.amountOut, ethUsd),
    poolQuotes: settled.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    ),
  })
})

/**
 * The swap transaction: buy exactly the quoted USDC for `recipient`, then
 * refund the ETH the pool did not take, atomically, before `deadline`.
 */
export function buildEthSwapCall(params: {
  readonly quote: EthSwapQuote
  readonly chainId: number
  readonly recipient: Address
  /** Unix seconds. */
  readonly deadline: bigint
}): Result<{ to: Address; data: Hex; value: bigint }, EthSwapUnavailableError> {
  const { quote, chainId, recipient, deadline } = params
  const uniswap = UNISWAP_V3[chainId]
  if (!uniswap || isAddressEqual(recipient, uniswap.router)) {
    return err(
      new EthSwapUnavailableError({
        message: 'Paying with ETH is not available on this network.',
      }),
    )
  }
  const swap = encodeFunctionData({
    abi: routerAbi,
    functionName: 'exactOutputSingle',
    args: [
      {
        tokenIn: uniswap.weth,
        tokenOut: getDestinationContracts(chainId).usdc,
        fee: quote.fee,
        recipient,
        amountOut: quote.amountOut,
        amountInMaximum: quote.maximumEth,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })
  const refund = encodeFunctionData({
    abi: routerAbi,
    functionName: 'refundETH',
  })
  return ok({
    to: uniswap.router,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: 'multicall',
      args: [deadline, [swap, refund]],
    }),
    value: quote.maximumEth,
  })
}
