import { getDestinationContracts } from '@ens-apps/smart-account'
import {
  type Address,
  encodeFunctionData,
  formatEther,
  type Hex,
  isAddressEqual,
  parseAbi,
} from 'viem'
import { chain } from '@/config'
import { publicClient } from '@/lib/wagmi'

// Uniswap v3 deployments: https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments
const DEPLOYMENTS: Record<
  number,
  { quoter: Address; router: Address; weth: Address; ethUsd: Address }
> = {
  1: {
    quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    ethUsd: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
  },
  11155111: {
    quoter: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
    router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    weth: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
    ethUsd: '0x694AA1769357215DE4FAC081bf1f309aDC325306',
  },
}

const quoterAbi = parseAbi([
  'function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96) params) view returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
])
const routerAbi = parseAbi([
  'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)',
  'function refundETH() payable',
  'function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)',
])
const feedAbi = parseAbi([
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
])

const POOL_FEES = [500, 3000, 10000] as const
const SLIPPAGE_BPS = 200n
const MAX_MARKET_PREMIUM_BPS = 1000n
const BPS = 10_000n
const QUOTE_LIFETIME_MS = 30_000
const SWAP_DEADLINE_SECONDS = 20 * 60
const FEED_MAX_AGE_SECONDS = Number(chain.id) === 1 ? 7_200n : 86_400n

export type EthSwapQuote = Readonly<{
  amountOut: bigint
  amountIn: bigint
  maximumEth: bigint
  fee: (typeof POOL_FEES)[number]
  quotedAt: number
}>

export const ceilDiv = (numerator: bigint, denominator: bigint): bigint =>
  (numerator + denominator - 1n) / denominator

/** Reject a pool with no route or an exchange rate far from the ETH/USD feed. */
export const selectEthSwapQuote = (
  amountOut: bigint,
  ethUsd8: bigint,
  quotes: readonly { fee: EthSwapQuote['fee']; amountIn: bigint }[],
  quotedAt: number,
): EthSwapQuote => {
  if (amountOut <= 0n || ethUsd8 <= 0n)
    throw new Error('Invalid ETH swap price')
  const leastEth = quotes
    .filter(({ amountIn }) => amountIn > 0n)
    .reduce<(typeof quotes)[number] | undefined>(
      (best, quote) => (!best || quote.amountIn < best.amountIn ? quote : best),
      undefined,
    )
  if (!leastEth) throw new Error('No ETH to USDC swap is available')

  // USDC has six decimals and the feed eight: USD * 1e18 / ETH/USD.
  const referenceEth = ceilDiv(amountOut * 10n ** 20n, ethUsd8)
  const marketLimit = ceilDiv(
    referenceEth * (BPS + MAX_MARKET_PREMIUM_BPS),
    BPS,
  )
  const maximumEth = ceilDiv(leastEth.amountIn * (BPS + SLIPPAGE_BPS), BPS)
  if (maximumEth > marketLimit) {
    throw new Error('The ETH exchange rate is too high. Try again later.')
  }
  return {
    amountOut,
    amountIn: leastEth.amountIn,
    maximumEth,
    fee: leastEth.fee,
    quotedAt,
  }
}

/** The registrar collects USDC, so buy its exact funding amount with native ETH. */
export const getEthSwapQuote = async (
  amountOut: bigint,
): Promise<EthSwapQuote> => {
  const deployment = DEPLOYMENTS[chain.id]
  if (!deployment) throw new Error('ETH payment is unavailable on this network')
  if (amountOut <= 0n) throw new Error('No USDC funding is required')

  const [roundId, answer, , updatedAt, answeredInRound] =
    await publicClient.readContract({
      address: deployment.ethUsd,
      abi: feedAbi,
      functionName: 'latestRoundData',
    })
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000))
  if (
    answer <= 0n ||
    answeredInRound < roundId ||
    updatedAt === 0n ||
    updatedAt > nowSeconds ||
    nowSeconds - updatedAt > FEED_MAX_AGE_SECONDS
  ) {
    throw new Error('The ETH price feed is unavailable. Try again later.')
  }

  const usdc = getDestinationContracts(chain.id).usdc
  const results = await Promise.allSettled(
    POOL_FEES.map(async (fee) => {
      const [amountIn] = await publicClient.readContract({
        address: deployment.quoter,
        abi: quoterAbi,
        functionName: 'quoteExactOutputSingle',
        args: [
          {
            tokenIn: deployment.weth,
            tokenOut: usdc,
            amount: amountOut,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      })
      return { fee, amountIn }
    }),
  )
  const quotes = results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  )
  return selectEthSwapQuote(amountOut, answer, quotes, Date.now())
}

/** A single atomic swap followed by refunding any ETH the router did not spend. */
export const buildEthSwapCall = (
  quote: EthSwapQuote,
  recipient: Address,
  now = Date.now(),
): {
  to: Address
  data: Hex
  value: bigint
} => {
  const deployment = DEPLOYMENTS[chain.id]
  if (!deployment) throw new Error('ETH payment is unavailable on this network')
  const usdc = getDestinationContracts(chain.id).usdc
  if (isAddressEqual(recipient, deployment.router)) {
    throw new Error('The swap recipient must be the connected wallet')
  }
  const swap = encodeFunctionData({
    abi: routerAbi,
    functionName: 'exactOutputSingle',
    args: [
      {
        tokenIn: deployment.weth,
        tokenOut: usdc,
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
  return {
    to: deployment.router,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: 'multicall',
      args: [
        BigInt(Math.floor(now / 1000) + SWAP_DEADLINE_SECONDS),
        [swap, refund],
      ],
    }),
    value: quote.maximumEth,
  }
}

export const assertFreshEthQuote = (
  quote: EthSwapQuote,
  now = Date.now(),
): void => {
  if (now - quote.quotedAt < 0 || now - quote.quotedAt > QUOTE_LIFETIME_MS) {
    throw new Error('The ETH quote expired. Refresh it and try again.')
  }
}

export const formatEthQuote = (quote: EthSwapQuote): string =>
  `${formatEther(quote.amountIn)} ETH (up to ${formatEther(quote.maximumEth)} ETH)`
