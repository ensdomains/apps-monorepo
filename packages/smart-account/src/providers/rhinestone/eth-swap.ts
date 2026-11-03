/**
 * Fund the HCA with USDC from the wallet's ETH on the app chain, through
 * Rhinestone's swap solvers.
 *
 * Native ETH cannot be pulled from the wallet with a signature (Permit2 only
 * moves ERC-20s, and the orchestrator answers an EOA paying in ETH with a
 * `wrap` requirement the SDK leaves to the app), so the wallet first sends the
 * ETH to the HCA. The HCA then swaps exactly that ETH into USDC with an intent
 * the owner signs: the session cannot, as its policy refuses any execution that
 * is not part of a registration. The swap's fees come out of the ETH, so the
 * HCA ends up holding USDC only, and every later leg pays in USDC as before.
 *
 * Every quote is held to the Chainlink ETH/USD feed before anything is signed.
 */

import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import type {
  IntentRoute,
  PreparedTransactionData,
  RhinestoneAccount,
} from '@rhinestone/sdk'
import { OrchestratorError } from '@rhinestone/sdk/errors'
import { err, fromPromise, ok, type Result } from 'neverthrow'
import {
  type Address,
  type Chain,
  isAddress,
  isAddressEqual,
  type PublicClient,
  parseAbi,
  zeroAddress,
} from 'viem'
import { readContract } from 'viem/actions'

/** How the orchestrator names native ETH. */
export const NATIVE_ETH: Address = zeroAddress

/** Chainlink ETH/USD aggregators, 8 decimals, by chain id. */
export const ETH_USD_FEEDS: Readonly<
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

const ethUsdFeedAbi = parseAbi([
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
])

/** ETH has 18 decimals, USDC 6 and the feed 8: 10^(18 - 6 + 8). */
const USDC_TO_WEI_AT_FEED_SCALE = 10n ** 20n

const BPS = 10_000n

/**
 * What the wallet sends on top of the quoted input, so the exact-input swap
 * still delivers the shortfall after the price moves a little. The surplus
 * arrives as USDC and is credited to the next registration, like any other.
 */
export const ETH_SWAP_DEPOSIT_BUFFER_BPS = 150n

/**
 * How far above the ETH shown at checkout the run may still send. A larger
 * move asks the user to start again rather than spend what they did not see.
 */
export const ETH_SWAP_DISPLAYED_DRIFT_BPS = 300n

// A quote this close to expiring is not worth signing.
const EXPIRY_MARGIN_S = 30n

/**
 * The most a swap may cost over the USDC it delivers, at the Chainlink price:
 * 3%, at least 2 USDC. Covers the swap fee and the intent's gas, which on
 * mainnet is a fixed cost worth more than a percentage of a small name.
 */
export function ethSwapMaxFee(amountOut: bigint): bigint {
  const threePercent = (amountOut * 3n) / 100n
  return threePercent > 2_000_000n ? threePercent : 2_000_000n
}

const divCeil = (numerator: bigint, denominator: bigint): bigint =>
  (numerator + denominator - 1n) / denominator

/** `value` widened by `bps`, rounded up. */
export const withBps = (value: bigint, bps: bigint): bigint =>
  divCeil(value * (BPS + bps), BPS)

/** Wei worth `usdc` (6 decimals) at an ETH/USD price with 8 decimals, rounded up. */
export function weiForUsdc(usdc: bigint, ethUsd: bigint): bigint {
  return divCeil(usdc * USDC_TO_WEI_AT_FEED_SCALE, ethUsd)
}

/** The ETH a swap delivering `amountOut` may take at most, fee included. */
export function maxEthSwapInput(amountOut: bigint, ethUsd: bigint): bigint {
  return weiForUsdc(amountOut + ethSwapMaxFee(amountOut), ethUsd)
}

/**
 * What the wallet sends the HCA so it holds enough ETH for a swap quoted at
 * `quotedAmountIn`: that plus the buffer, never past the Chainlink bound, less
 * what the HCA already holds (an earlier attempt's deposit, say).
 */
export function planEthDeposit(params: {
  readonly quotedAmountIn: bigint
  readonly maxAmountIn: bigint
  readonly hcaEthBalance: bigint
}): bigint {
  const buffered = withBps(params.quotedAmountIn, ETH_SWAP_DEPOSIT_BUFFER_BPS)
  const target = buffered > params.maxAmountIn ? params.maxAmountIn : buffered
  return target > params.hcaEthBalance ? target - params.hcaEthBalance : 0n
}

/**
 * The ETH the swap spends: all the HCA holds, up to the Chainlink bound, so
 * none is left behind. Only ETH the HCA held past that bound stays.
 */
export const ethSwapAmountIn = (params: {
  readonly hcaEthBalance: bigint
  readonly maxAmountIn: bigint
}): bigint =>
  params.hcaEthBalance > params.maxAmountIn
    ? params.maxAmountIn
    : params.hcaEthBalance

export type EthUsdRound = Readonly<{
  roundId: bigint
  answer: bigint
  updatedAt: bigint
  answeredInRound: bigint
}>

/** The ETH/USD feed could not be read, or its answer cannot be trusted. */
export class EthUsdPriceUnavailableError extends TaggedError(
  'EthUsdPriceUnavailableError',
)<{ message: string; cause?: unknown }> {}

/** The round's ETH/USD price (8 decimals), if it is a usable answer. */
export function validateEthUsdRound(
  round: EthUsdRound,
  nowSeconds: bigint,
  maxAgeSeconds: bigint,
): Result<bigint, EthUsdPriceUnavailableError> {
  const isUsable =
    round.answer > 0n &&
    round.answeredInRound >= round.roundId &&
    round.updatedAt > 0n &&
    round.updatedAt <= nowSeconds &&
    nowSeconds - round.updatedAt <= maxAgeSeconds
  return isUsable
    ? ok(round.answer)
    : err(
        new EthUsdPriceUnavailableError({
          message: 'The ETH price feed is unavailable. Try again later.',
        }),
      )
}

/** Read and check the Chainlink ETH/USD price for `chainId`. */
export const readEthUsdPrice = ResultFn(async function* (params: {
  readonly publicClient: PublicClient
  readonly chainId: number
  readonly nowSeconds: bigint
}) {
  const feed = ETH_USD_FEEDS[params.chainId]
  if (!feed) {
    return err(
      new EthUsdPriceUnavailableError({
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
      new EthUsdPriceUnavailableError({
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

/**
 * A swap of the HCA's ETH into USDC on `chain`, delivered to the HCA itself.
 *
 * `amountIn` absent: size it. The quote asks for exactly `amountOut` and
 * declares `pendingDeposit` as ETH still on its way, so it can be priced
 * before the wallet sends anything.
 *
 * `amountIn` present: the swap to sign. It spends exactly that ETH and must
 * deliver at least `amountOut`.
 */
export type EthSwapRoute = Readonly<{
  hca: Address
  chain: Chain
  usdc: Address
  amountOut: bigint
  /** The Chainlink bound: no quote may take more ETH than this. */
  maxAmountIn: bigint
  amountIn?: bigint
  pendingDeposit?: bigint
}>

export type EthSwapQuote = Readonly<{
  route: EthSwapRoute
  prepared: PreparedTransactionData
  /** ETH the swap spends, fees included. */
  amountIn: bigint
  /** USDC it delivers to the HCA. */
  amountOut: bigint
  /** Unix seconds the intent can still be filled until. */
  expires: bigint
}>

/** The orchestrator could not quote the swap. */
export class EthSwapUnavailableError extends TaggedError(
  'EthSwapUnavailableError',
)<{ message: string; cause?: unknown }> {}

/** The quoted swap breaks a rule in `validateEthSwapQuote`; nothing was signed. */
export class EthSwapRejectedError extends TaggedError('EthSwapRejectedError')<{
  message: string
}> {}

/** Signing or submitting failed, including a declined signature. */
export class EthSwapSubmitError extends TaggedError('EthSwapSubmitError')<{
  message: string
  cause?: unknown
}> {}

/**
 * The signed swap was submitted but no answer said whether it was accepted, so
 * it may still fill. `intentId` is its nonce.
 */
export class EthSwapUnconfirmedError extends TaggedError(
  'EthSwapUnconfirmedError',
)<{ message: string; cause?: unknown; intentId: bigint }> {}

// A 4xx is the orchestrator refusing it; anything else may have been accepted.
const isRefusal = (error: unknown) =>
  error instanceof OrchestratorError &&
  error.statusCode !== undefined &&
  error.statusCode < 500

const UNSPONSORED = { gas: false, bridging: false, swaps: false } as const

const unixNow = (): bigint => BigInt(Math.floor(Date.now() / 1000))

/** Quote `route`, returning it only if every rule in `validateEthSwapQuote` holds. */
export const quoteEthSwap = ResultFn(async function* (
  account: RhinestoneAccount,
  route: EthSwapRoute,
  now: () => bigint = unixNow,
) {
  const { chain } = route
  const pendingDeposit = route.pendingDeposit ?? 0n
  const prepared = yield* fromPromise(
    account.prepareTransaction({
      sourceChains: [chain],
      targetChain: chain,
      calls: [],
      sponsored: UNSPONSORED,
      feeAsset: NATIVE_ETH,
      ...(route.amountIn === undefined
        ? {
            sourceAssets: { [chain.id]: [NATIVE_ETH] },
            tokenRequests: [{ address: route.usdc, amount: route.amountOut }],
            ...(pendingDeposit > 0n
              ? {
                  auxiliaryFunds: {
                    [chain.id]: { [NATIVE_ETH]: pendingDeposit },
                  },
                }
              : {}),
          }
        : {
            sourceAssets: [
              { chain, address: NATIVE_ETH, amount: route.amountIn },
            ],
            tokenRequests: [{ address: route.usdc }],
          }),
    }),
    (cause) =>
      new EthSwapUnavailableError({
        message: 'No ETH to USDC swap is available right now.',
        cause,
      }),
  )
  return validateEthSwapQuote({ route, prepared, now: now() })
})

const sameAddress = (value: unknown, expected: Address): boolean =>
  typeof value === 'string' &&
  isAddress(value, { strict: false }) &&
  isAddressEqual(value, expected)

// The orchestrator's JSON carries amounts as decimal strings; anything else is
// unreadable rather than zero.
const toBigInt = (value: unknown): bigint | undefined => {
  if (
    typeof value !== 'bigint' &&
    typeof value !== 'string' &&
    typeof value !== 'number'
  ) {
    return undefined
  }
  try {
    return BigInt(value)
  } catch {
    return undefined
  }
}

/**
 * Accept a prepared swap only if what the owner would sign takes nothing but
 * the HCA's ETH on the app chain and pays the USDC to the HCA there:
 *
 * 1. the intent is the HCA's;
 * 2. every element is on the app chain, delivers to the HCA there, and runs no
 *    calls of its own before or after the swap;
 * 3. it can still be filled for a while;
 * 4. it spends only native ETH on the app chain, no more than the Chainlink
 *    bound, and exactly the route's `amountIn` when that is set;
 * 5. it delivers only USDC, at least `amountOut`.
 */
export function validateEthSwapQuote(params: {
  readonly route: EthSwapRoute
  readonly prepared: PreparedTransactionData
  readonly now: bigint
}): Result<EthSwapQuote, EthSwapRejectedError> {
  const { route, prepared, now } = params
  const reject = (message: string) => err(new EthSwapRejectedError({ message }))
  const { intentOp, intentCost } = prepared.intentRoute

  const intentRejection = rejectIntent(route, intentOp)
  if (intentRejection !== undefined) return reject(intentRejection)

  const expires = toBigInt(intentOp.expires)
  if (expires === undefined || expires <= now + EXPIRY_MARGIN_S) {
    return reject('The ETH quote has expired.')
  }

  const amountIn = readEthSpent(route, intentCost)
  if (amountIn === undefined) {
    return reject('The swap spends something other than your ETH.')
  }
  if (amountIn > route.maxAmountIn) {
    return reject('The ETH exchange rate is too high. Try again later.')
  }
  if (route.amountIn !== undefined && amountIn > route.amountIn) {
    return reject('The swap spends more ETH than was sent.')
  }

  const amountOut = readUsdcReceived(route, intentCost)
  if (amountOut === undefined || amountOut < route.amountOut) {
    return reject('The swap delivers less USDC than needed.')
  }

  return ok({ route, prepared, amountIn, amountOut, expires })
}

/** Rules 1 and 2, on the intent itself. */
function rejectIntent(
  route: EthSwapRoute,
  intentOp: IntentRoute['intentOp'],
): string | undefined {
  if (!sameAddress(intentOp.sponsor, route.hca)) {
    return 'The swap pays from another account.'
  }
  if (intentOp.elements.length === 0) return 'The swap is empty.'
  const isLocal = intentOp.elements.every(
    ({ chainId, mandate }) =>
      Number(chainId) === route.chain.id &&
      Number(mandate.destinationChainId) === route.chain.id &&
      sameAddress(mandate.recipient, route.hca),
  )
  if (!isLocal) return 'The swap pays another account or chain.'
  const runsCalls = intentOp.elements.some(
    ({ mandate }) =>
      (mandate.destinationOps?.ops.length ?? 0) > 0 ||
      (mandate.preClaimOps?.ops.length ?? 0) > 0,
  )
  return runsCalls ? 'The swap runs other operations.' : undefined
}

/** Rule 4: the ETH spent, or undefined when anything else is spent too. */
function readEthSpent(
  route: EthSwapRoute,
  intentCost: IntentRoute['intentCost'],
): bigint | undefined {
  const spends = Object.entries(intentCost.tokensSpent ?? {}).flatMap(
    ([chainId, tokens]) =>
      Object.entries(tokens).map(([token, spent]) => ({
        chainId: Number(chainId),
        token,
        amount:
          (toBigInt(spent.locked) ?? -1n) + (toBigInt(spent.unlocked) ?? -1n),
      })),
  )
  const isEthOnly = spends.every(
    ({ chainId, token, amount }) =>
      chainId === route.chain.id &&
      sameAddress(token, NATIVE_ETH) &&
      amount >= 0n,
  )
  if (spends.length === 0 || !isEthOnly) return undefined
  return spends.reduce((total, { amount }) => total + amount, 0n)
}

/** Rule 5: the USDC delivered, or undefined when anything else is. */
function readUsdcReceived(
  route: EthSwapRoute,
  intentCost: IntentRoute['intentCost'],
): bigint | undefined {
  const [received, ...otherReceived] = intentCost.tokensReceived ?? []
  if (
    !received ||
    otherReceived.length > 0 ||
    !sameAddress(received.tokenAddress, route.usdc)
  ) {
    return undefined
  }
  return toBigInt(received.destinationAmount)
}

/**
 * Have the owner sign the quoted swap and submit it. The SDK signs with the
 * HCA's owner when no session signer is given; the validator accepts a bare
 * owner signature for any execution.
 */
export const submitEthSwap = ResultFn(async function* (
  account: RhinestoneAccount,
  quote: EthSwapQuote,
  now: () => bigint = unixNow,
) {
  const signed = yield* fromPromise(
    account.signTransaction(quote.prepared),
    (cause) =>
      new EthSwapSubmitError({ message: 'The swap was not signed.', cause }),
  )
  if (now() + EXPIRY_MARGIN_S >= quote.expires) {
    return err(
      new EthSwapSubmitError({
        message: 'The ETH quote expired before it was signed.',
      }),
    )
  }
  const submitted = yield* fromPromise(
    account.submitTransaction(signed),
    (cause) =>
      isRefusal(cause)
        ? new EthSwapSubmitError({
            message: 'The swap could not be submitted.',
            cause,
          })
        : new EthSwapUnconfirmedError({
            message: 'The swap was sent, but not confirmed.',
            cause,
            intentId: BigInt(quote.prepared.intentRoute.intentOp.nonce),
          }),
  )
  return ok(submitted)
})
