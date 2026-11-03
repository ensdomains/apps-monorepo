/**
 * Standalone-HCA funding from the wallet's ETH on the app chain.
 *
 * Two wallet prompts, in two machine states:
 *   1. `depositEthActor`: the wallet sends the HCA the ETH a swap of the
 *      shortfall needs, sized from a Rhinestone quote and bounded by the
 *      Chainlink ETH/USD price.
 *   2. `swapEthActor`: the owner signs a Rhinestone intent that swaps exactly
 *      that ETH into USDC for the HCA, fees included.
 * The HCA is then funded in USDC and the run continues as if a permit had
 * funded it. The HCA balances are the source of truth throughout: an attempt
 * that stopped halfway leaves ETH or USDC in the HCA, and the next one sends
 * only what is still missing.
 */

import {
  ETH_SWAP_DISPLAYED_DRIFT_BPS,
  type EthSwapQuote,
  EthSwapUnconfirmedError,
  ethSwapAmountIn,
  getDestinationContracts,
  maxEthSwapInput,
  planEthDeposit,
  quoteEthSwap,
  readEthUsdPrice,
  submitEthSwap,
  withBps,
} from '@ens-apps/smart-account'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import { err, fromPromise, ok, okAsync, type ResultAsync } from 'neverthrow'
import {
  type Address,
  type Chain,
  formatEther,
  type Hash,
  type PublicClient,
  type WalletClient,
} from 'viem'
import {
  estimateFeesPerGas,
  estimateGas,
  getBalance,
  sendTransaction,
  waitForTransactionReceipt,
} from 'viem/actions'
import type { Signer } from '../../types/signer.types'
import { awaitL2BridgeActor } from './registration.hca.actors'

/** Paying the shortfall with the wallet's ETH, as checkout showed it. */
export interface EthFunding {
  /** The ETH (wei) checkout showed the wallet sending. */
  readonly displayedCharge?: bigint
}

/** A swap intent that was submitted and may not have settled yet. */
export interface UnsettledEthSwap {
  readonly intentId: bigint
  /** Epoch ms past which the intent can no longer fill. */
  readonly claimableUntil: number
}

/** What both steps need. */
interface EthFundingInput {
  readonly hca: Address
  /** USDC (6dp) the HCA is short of its budget. */
  readonly amountOut: bigint
  /** The HCA's signer: its SDK account quotes, and its owner signs the swap. */
  readonly signer: Signer
  readonly publicClient: PublicClient
}

/** Each gas unit the deposit is estimated at is reserved twice over. */
const GAS_RESERVE_MULTIPLIER = 2n

const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000))

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))

const hcaAccount = (
  signer: Signer,
): { account: RhinestoneAccount; chain: Chain } | Error => {
  if (signer.type !== 'rhinestone' || !signer.config.chain) {
    return new Error('Paying with ETH needs the smart account signer.')
  }
  return { account: signer.account, chain: signer.config.chain }
}

const walletOf = (
  signer: Signer,
): { client: WalletClient; address: Address } | Error => {
  const address =
    signer.type === 'eoa' ? signer.walletClient.account?.address : undefined
  return signer.type === 'eoa' && address
    ? { client: signer.walletClient, address }
    : new Error('Paying with ETH needs the wallet that owns this account.')
}

/** Why the deposit must not be sent, or undefined when it may be. */
export function rejectEthDeposit(params: {
  readonly deposit: bigint
  readonly displayedCharge?: bigint
  readonly walletBalance: bigint
  readonly gasReserve: bigint
}): string | undefined {
  const { deposit, displayedCharge, walletBalance, gasReserve } = params
  if (
    displayedCharge !== undefined &&
    deposit > withBps(displayedCharge, ETH_SWAP_DISPLAYED_DRIFT_BPS)
  ) {
    return (
      `Paying now takes ${formatEther(deposit)} ETH, but ` +
      `${formatEther(displayedCharge)} ETH was shown at checkout. ` +
      'Please start the registration again.'
    )
  }
  if (walletBalance < deposit + gasReserve) {
    return 'Not enough ETH in your wallet for the payment and its network fee.'
  }
  return undefined
}

/** The ETH the HCA holds, and the most a swap of `amountOut` may take. */
const readSwapBounds = ResultFn(async function* (
  input: EthFundingInput & { readonly chain: Chain },
) {
  const ethUsd = yield* readEthUsdPrice({
    publicClient: input.publicClient,
    chainId: input.chain.id,
    nowSeconds: nowSeconds(),
  })
  const hcaEthBalance = yield* fromPromise(
    getBalance(input.publicClient, { address: input.hca }),
    toError,
  )
  return ok({
    hcaEthBalance,
    maxAmountIn: maxEthSwapInput(input.amountOut, ethUsd),
  })
})

/**
 * Wait out a deposit an earlier attempt sent, so it is counted rather than
 * sent again. One that never confirms leaves the HCA balance as it was, which
 * the next deposit then makes up.
 */
const settlePendingDeposit = (
  publicClient: PublicClient,
  hash: Hash | undefined,
): ResultAsync<void, Error> =>
  hash === undefined
    ? okAsync(undefined)
    : fromPromise(
        waitForTransactionReceipt(publicClient, { hash }).then(() => {}),
        (cause) =>
          new Error(
            'Your earlier ETH payment has not confirmed yet, so not paying again. Try again in a few minutes.',
            { cause },
          ),
      )

/** What paying `amountOut` with ETH asks of the wallet right now. */
export type EthDepositQuote = Readonly<{
  /** The ETH (wei) the wallet sends the HCA; `0n` when it holds enough. */
  deposit: bigint
  /** The most the swap may take, at the Chainlink price. */
  maxAmountIn: bigint
}>

/**
 * Size the deposit from a Rhinestone quote for the swap, bounded by the
 * Chainlink price. Nothing is signed; checkout shows this before the run.
 */
export const quoteEthDepositActor = ResultFn(async function* (
  input: EthFundingInput,
) {
  const hca = hcaAccount(input.signer)
  if (hca instanceof Error) return err(hca)
  const { hcaEthBalance, maxAmountIn } = yield* readSwapBounds({
    ...input,
    chain: hca.chain,
  })
  const sizing = yield* quoteEthSwap(hca.account, {
    hca: input.hca,
    chain: hca.chain,
    usdc: getDestinationContracts(hca.chain.id).usdc,
    amountOut: input.amountOut,
    maxAmountIn,
    pendingDeposit:
      maxAmountIn > hcaEthBalance ? maxAmountIn - hcaEthBalance : 0n,
  })
  return ok<EthDepositQuote>({
    deposit: planEthDeposit({
      quotedAmountIn: sizing.amountIn,
      maxAmountIn,
      hcaEthBalance,
    }),
    maxAmountIn,
  })
})

/**
 * Send the HCA the ETH a swap of `amountOut` needs, less what it holds.
 * Resolves with what was sent, `0n` when the HCA already held enough.
 */
export const depositEthActor = ResultFn(async function* (
  input: EthFundingInput & {
    readonly funding: EthFunding
    /** The wallet, which sends the ETH. */
    readonly approvalSigner: Signer
    /** A deposit an earlier attempt sent. */
    readonly pendingDeposit?: Hash
    /** Receives the deposit's hash the moment the wallet sends it. */
    readonly onDepositSent?: (hash: Hash) => void
  },
) {
  const hca = hcaAccount(input.signer)
  if (hca instanceof Error) return err(hca)
  const wallet = walletOf(input.approvalSigner)
  if (wallet instanceof Error) return err(wallet)

  yield* settlePendingDeposit(input.publicClient, input.pendingDeposit)

  const { deposit } = yield* quoteEthDepositActor(input)
  if (deposit === 0n) return ok(0n)

  const [walletBalance, gas, fees] = yield* fromPromise(
    Promise.all([
      getBalance(input.publicClient, { address: wallet.address }),
      estimateGas(input.publicClient, {
        account: wallet.address,
        to: input.hca,
        value: deposit,
      }),
      estimateFeesPerGas(input.publicClient),
    ]),
    (cause) =>
      new Error('Could not prepare the ETH payment to your account.', {
        cause,
      }),
  )
  const refusal = rejectEthDeposit({
    deposit,
    displayedCharge: input.funding.displayedCharge,
    walletBalance,
    gasReserve: gas * fees.maxFeePerGas * GAS_RESERVE_MULTIPLIER,
  })
  if (refusal) return err(new Error(refusal))

  const hash = yield* fromPromise(
    sendTransaction(wallet.client, {
      account: wallet.client.account ?? wallet.address,
      chain: hca.chain,
      to: input.hca,
      value: deposit,
    }),
    toError,
  )
  input.onDepositSent?.(hash)
  const receipt = yield* fromPromise(
    waitForTransactionReceipt(input.publicClient, { hash }),
    toError,
  )
  if (receipt.status !== 'success') {
    return err(new Error('The ETH payment to your account failed on-chain.'))
  }
  return ok(deposit)
})

/**
 * How the swap step ended: `filled`, the swap it sent filled; `settled`, a
 * swap an earlier attempt sent turned out to have landed.
 */
export type EthSwapOutcome = 'filled' | 'settled'

/**
 * Swap the ETH the HCA holds into USDC for it, signed by the owner, and wait
 * for the fill. A swap an earlier attempt sent is settled first: if it landed
 * there is nothing to swap, and if it died its ETH is back in the HCA.
 */
export const swapEthActor = ResultFn(async function* (
  input: EthFundingInput & {
    readonly unsettledSwap?: UnsettledEthSwap
    readonly fetchIntentStatus?: (
      intentId: bigint,
      signal?: AbortSignal,
    ) => Promise<string | null>
    readonly onSwapSubmitted?: (swap: UnsettledEthSwap) => void
    readonly signal?: AbortSignal
  },
) {
  const hca = hcaAccount(input.signer)
  if (hca instanceof Error) return err(hca)

  if (input.unsettledSwap) {
    const verdict = yield* awaitL2BridgeActor({
      ...input.unsettledSwap,
      fetchIntentStatus: input.fetchIntentStatus,
      signal: input.signal,
      payment: 'ETH swap',
    })
    if (verdict === 'landed') return ok<EthSwapOutcome>('settled')
  }

  const bounds = yield* readSwapBounds({ ...input, chain: hca.chain })
  const amountIn = ethSwapAmountIn(bounds)
  if (amountIn === 0n) {
    return err(new Error('Your account holds no ETH to swap.'))
  }
  const quote: EthSwapQuote = yield* quoteEthSwap(hca.account, {
    hca: input.hca,
    chain: hca.chain,
    usdc: getDestinationContracts(hca.chain.id).usdc,
    amountOut: input.amountOut,
    maxAmountIn: bounds.maxAmountIn,
    amountIn,
  })
  const claimableUntil = Number(quote.expires) * 1_000
  const intent = yield* submitEthSwap(hca.account, quote).mapErr((error) => {
    // It may still fill, so a retry must settle it before swapping again.
    if (error instanceof EthSwapUnconfirmedError) {
      input.onSwapSubmitted?.({ intentId: error.intentId, claimableUntil })
    }
    return error
  })
  input.onSwapSubmitted?.({ intentId: intent.id, claimableUntil })
  yield* fromPromise(hca.account.waitForExecution(intent, false), toError)
  return ok<EthSwapOutcome>('filled')
})
