/**
 * Standalone-HCA funding from the wallet's ETH, in `swappingEth`.
 *
 * The wallet buys the USDC it is short on Uniswap (`helpers/eth-usdc-swap.ts`)
 * in one transaction, and the run then funds the HCA from that USDC with the
 * usual EIP-2612 permit, exactly as if the wallet had held it all along. The
 * wallet's USDC balance is the source of truth: a retry buys only what is
 * still missing, so a swap that landed is never bought twice.
 */

import { getDestinationContracts } from '@ens-apps/smart-account'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, fromPromise, ok, okAsync, ResultAsync } from 'neverthrow'
import {
  type Address,
  erc20Abi,
  formatEther,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import {
  estimateFeesPerGas,
  estimateGas,
  getBalance,
  readContract,
  sendTransaction,
  waitForTransactionReceipt,
} from 'viem/actions'
import {
  buildEthSwapCall,
  ETH_SWAP_DISPLAYED_DRIFT_BPS,
  type EthSwapQuote,
  type EthSwapUnavailableError,
  quoteEthSwap,
  withBps,
} from '../../helpers/eth-usdc-swap'
import type { Signer } from '../../types/signer.types'

/** Paying the shortfall with the wallet's ETH, as checkout showed it. */
export interface EthFunding {
  /** The most ETH (wei) checkout showed the wallet sending. */
  readonly displayedCharge?: bigint
}

/** What paying with ETH asks of the wallet right now. */
export type EthPaymentQuote = Readonly<{
  /** USDC (6dp) the wallet buys: the permit's value less what it holds. */
  usdcToBuy: bigint
  /** The swap that buys it; absent when the wallet already holds enough. */
  swap?: EthSwapQuote
}>

/** Each gas unit the swap is estimated at is reserved twice over. */
const GAS_RESERVE_MULTIPLIER = 2n
/** How long the signed swap stays valid on-chain. */
const SWAP_DEADLINE_SECONDS = 20n * 60n
/** Leeway for this device's clock running ahead of the chain's. */
const DEADLINE_CLOCK_MARGIN_SECONDS = 5n * 60n

/** A swap the wallet sent, and the deadline after which the router refuses it. */
export type PendingEthSwap = Readonly<{ hash: Hash; deadline: bigint }>

const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000))

/** Paying with ETH failed; `cause` keeps the wallet's error, so a rejection is still recognised. */
export class EthSwapPaymentError extends TaggedError('EthSwapPaymentError')<{
  readonly message: string
  readonly cause: unknown
}> {}

const paymentError = (message: string, cause?: unknown) =>
  new EthSwapPaymentError({ message, cause })

const toError = (cause: unknown): EthSwapPaymentError =>
  paymentError(cause instanceof Error ? cause.message : String(cause), cause)

/** The USDC the wallet still has to buy before it can sign `permitValue`. */
export const usdcToBuy = (permitValue: bigint, walletUsdc: bigint): bigint =>
  permitValue > walletUsdc ? permitValue - walletUsdc : 0n

/** Why the swap must not be sent, or undefined when it may be. */
export function rejectEthSwap(params: {
  /** What the swap sends, at its slippage limit. */
  readonly maximumEth: bigint
  readonly displayedCharge?: bigint
  readonly walletBalance: bigint
  readonly gasReserve: bigint
}): string | undefined {
  const { maximumEth, displayedCharge, walletBalance, gasReserve } = params
  if (
    displayedCharge !== undefined &&
    maximumEth > withBps(displayedCharge, ETH_SWAP_DISPLAYED_DRIFT_BPS)
  ) {
    return (
      `Paying now takes up to ${formatEther(maximumEth)} ETH, but ` +
      `${formatEther(displayedCharge)} ETH was shown at checkout. ` +
      'Please start the registration again.'
    )
  }
  if (walletBalance < maximumEth + gasReserve) {
    return 'Not enough ETH in your wallet for the swap and its network fee.'
  }
  return undefined
}

/**
 * The USDC `owner` has to buy before signing a permit for `permitValue`, and
 * the swap that buys it. Nothing is signed; checkout shows this.
 */
export const quoteEthPaymentActor = ResultFn(async function* (input: {
  readonly owner: Address
  readonly permitValue: bigint
  readonly publicClient: PublicClient
  readonly chainId: number
}) {
  const walletUsdc = yield* fromPromise(
    readContract(input.publicClient, {
      address: getDestinationContracts(input.chainId).usdc,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [input.owner],
    }),
    toError,
  )
  const toBuy = usdcToBuy(input.permitValue, walletUsdc)
  if (toBuy === 0n) return ok<EthPaymentQuote>({ usdcToBuy: 0n })
  const swap = yield* quoteEthSwap({
    publicClient: input.publicClient,
    chainId: input.chainId,
    amountOut: toBuy,
    nowSeconds: nowSeconds(),
  })
  return ok<EthPaymentQuote>({ usdcToBuy: toBuy, swap })
})

const walletOf = (
  signer: Signer,
): { client: WalletClient; address: Address } | EthSwapPaymentError => {
  const address =
    signer.type === 'eoa' ? signer.walletClient.account?.address : undefined
  return signer.type === 'eoa' && address
    ? { client: signer.walletClient, address }
    : paymentError('Paying with ETH needs the wallet that owns this account.')
}

/** Past its deadline the router refuses a swap, so it can buy nothing more. */
export const isPastSwapDeadline = (
  swap: PendingEthSwap,
  now: bigint,
): boolean => now > swap.deadline + DEADLINE_CLOCK_MARGIN_SECONDS

/** Wait out an earlier swap before buying again; what it bought shows in the wallet's USDC. */
const settlePendingSwap = (
  publicClient: PublicClient,
  pending: PendingEthSwap | undefined,
): ResultAsync<void, EthSwapPaymentError> => {
  if (!pending || isPastSwapDeadline(pending, nowSeconds())) {
    return okAsync(undefined)
  }
  return fromPromise(
    waitForTransactionReceipt(publicClient, { hash: pending.hash }).then(
      () => {},
    ),
    (cause) =>
      paymentError(
        'Your earlier ETH swap has not confirmed yet, so not swapping again. Try again in a few minutes.',
        cause,
      ),
  )
}

/** Twice the swap's estimated gas cost: what the wallet must hold on top of the swap. */
const estimateSwapGasReserve = (input: {
  readonly publicClient: PublicClient
  readonly account: Address
  readonly call: Readonly<{ to: Address; data: Hex; value: bigint }>
}): ResultAsync<bigint, EthSwapPaymentError> =>
  fromPromise(
    Promise.all([
      estimateGas(input.publicClient, {
        account: input.account,
        ...input.call,
      }),
      estimateFeesPerGas(input.publicClient),
    ]),
    (cause) => paymentError('Could not prepare the ETH swap.', cause),
  ).map(([gas, fees]) => gas * fees.maxFeePerGas * GAS_RESERVE_MULTIPLIER)

/** The gas reserve the swap step will ask of `owner` for `swap`, for checkout to show. */
export const quoteEthSwapGasReserve = (input: {
  readonly publicClient: PublicClient
  readonly chainId: number
  readonly owner: Address
  readonly swap: EthSwapQuote
}): ResultAsync<bigint, EthSwapPaymentError | EthSwapUnavailableError> =>
  buildEthSwapCall({
    quote: input.swap,
    chainId: input.chainId,
    recipient: input.owner,
    deadline: nowSeconds() + SWAP_DEADLINE_SECONDS,
  }).asyncAndThen((call) =>
    estimateSwapGasReserve({
      publicClient: input.publicClient,
      account: input.owner,
      call,
    }),
  )

/**
 * Buy the USDC the wallet is short of signing a permit for `permitValue`.
 * Resolves with the USDC bought, `0n` when the wallet already held enough.
 */
export const swapEthForUsdcActor = ResultFn(async function* (input: {
  readonly permitValue: bigint
  readonly funding?: EthFunding
  /** The wallet, which swaps and later signs the permit. */
  readonly approvalSigner: Signer
  readonly publicClient: PublicClient
  /** A swap an earlier attempt sent. */
  readonly pendingSwap?: PendingEthSwap
  /** Receives the swap the moment the wallet sends it. */
  readonly onSwapSent?: (swap: PendingEthSwap) => void
  /** Set when the run is cancelled; nothing is sent after that. */
  readonly signal?: AbortSignal
}) {
  const wallet = walletOf(input.approvalSigner)
  if (wallet instanceof EthSwapPaymentError) return err(wallet)
  // Named so viem refuses to send while the wallet is on another chain.
  const { chain } = input.publicClient
  if (!chain) return err(paymentError('Paying with ETH needs the app chain.'))

  yield* settlePendingSwap(input.publicClient, input.pendingSwap)

  const { usdcToBuy: toBuy, swap } = yield* quoteEthPaymentActor({
    owner: wallet.address,
    permitValue: input.permitValue,
    publicClient: input.publicClient,
    chainId: chain.id,
  })
  if (!swap) return ok(0n)

  const deadline = nowSeconds() + SWAP_DEADLINE_SECONDS
  const call = yield* buildEthSwapCall({
    quote: swap,
    chainId: chain.id,
    recipient: wallet.address,
    deadline,
  })
  const [walletBalance, gasReserve] = yield* ResultAsync.combine([
    fromPromise(
      getBalance(input.publicClient, { address: wallet.address }),
      (cause) => paymentError('Could not prepare the ETH swap.', cause),
    ),
    estimateSwapGasReserve({
      publicClient: input.publicClient,
      account: wallet.address,
      call,
    }),
  ])
  const refusal = rejectEthSwap({
    maximumEth: swap.maximumEth,
    displayedCharge: input.funding?.displayedCharge,
    walletBalance,
    gasReserve,
  })
  if (refusal) return err(paymentError(refusal))
  // The quote and estimates above take time; a run cancelled meanwhile sends nothing.
  if (input.signal?.aborted) {
    return err(paymentError('The registration was cancelled before the swap.'))
  }

  const hash = yield* fromPromise(
    sendTransaction(wallet.client, {
      account: wallet.client.account ?? wallet.address,
      chain,
      ...call,
    }),
    toError,
  )
  input.onSwapSent?.({ hash, deadline })
  const receipt = yield* fromPromise(
    waitForTransactionReceipt(input.publicClient, { hash }),
    toError,
  )
  if (receipt.status !== 'success') {
    return err(paymentError('The ETH swap failed on-chain.'))
  }
  return ok(toBuy)
})
