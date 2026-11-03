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
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { err, fromPromise, ok, okAsync, type ResultAsync } from 'neverthrow'
import {
  type Address,
  erc20Abi,
  formatEther,
  type Hash,
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

const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000))

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))

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
): { client: WalletClient; address: Address } | Error => {
  const address =
    signer.type === 'eoa' ? signer.walletClient.account?.address : undefined
  return signer.type === 'eoa' && address
    ? { client: signer.walletClient, address }
    : new Error('Paying with ETH needs the wallet that owns this account.')
}

/**
 * Wait out a swap an earlier attempt sent, so its USDC is counted rather than
 * bought again. One that never confirms leaves the balance as it was, which
 * the next swap then makes up.
 */
const settlePendingSwap = (
  publicClient: PublicClient,
  hash: Hash | undefined,
): ResultAsync<void, Error> =>
  hash === undefined
    ? okAsync(undefined)
    : fromPromise(
        waitForTransactionReceipt(publicClient, { hash }).then(() => {}),
        (cause) =>
          new Error(
            'Your earlier ETH swap has not confirmed yet, so not swapping again. Try again in a few minutes.',
            { cause },
          ),
      )

/**
 * Buy the USDC the wallet is short of signing a permit for `permitValue`.
 * Resolves with the USDC bought, `0n` when the wallet already held enough.
 */
export const swapEthForUsdcActor = ResultFn(async function* (input: {
  readonly permitValue: bigint
  readonly funding: EthFunding
  /** The wallet, which swaps and later signs the permit. */
  readonly approvalSigner: Signer
  readonly publicClient: PublicClient
  /** A swap an earlier attempt sent. */
  readonly pendingSwap?: Hash
  /** Receives the swap's hash the moment the wallet sends it. */
  readonly onSwapSent?: (hash: Hash) => void
}) {
  const wallet = walletOf(input.approvalSigner)
  if (wallet instanceof Error) return err(wallet)
  // Named so viem refuses to send while the wallet is on another chain.
  const { chain } = input.publicClient
  if (!chain) return err(new Error('Paying with ETH needs the app chain.'))

  yield* settlePendingSwap(input.publicClient, input.pendingSwap)

  const { usdcToBuy: toBuy, swap } = yield* quoteEthPaymentActor({
    owner: wallet.address,
    permitValue: input.permitValue,
    publicClient: input.publicClient,
    chainId: chain.id,
  })
  if (!swap) return ok(0n)

  const call = yield* buildEthSwapCall({
    quote: swap,
    chainId: chain.id,
    recipient: wallet.address,
    deadline: nowSeconds() + SWAP_DEADLINE_SECONDS,
  })
  const [walletBalance, gas, fees] = yield* fromPromise(
    Promise.all([
      getBalance(input.publicClient, { address: wallet.address }),
      estimateGas(input.publicClient, { account: wallet.address, ...call }),
      estimateFeesPerGas(input.publicClient),
    ]),
    (cause) => new Error('Could not prepare the ETH swap.', { cause }),
  )
  const refusal = rejectEthSwap({
    maximumEth: swap.maximumEth,
    displayedCharge: input.funding.displayedCharge,
    walletBalance,
    gasReserve: gas * fees.maxFeePerGas * GAS_RESERVE_MULTIPLIER,
  })
  if (refusal) return err(new Error(refusal))

  const hash = yield* fromPromise(
    sendTransaction(wallet.client, {
      account: wallet.client.account ?? wallet.address,
      chain,
      ...call,
    }),
    toError,
  )
  input.onSwapSent?.(hash)
  const receipt = yield* fromPromise(
    waitForTransactionReceipt(input.publicClient, { hash }),
    toError,
  )
  if (receipt.status !== 'success') {
    return err(new Error('The ETH swap failed on-chain.'))
  }
  return ok(toBuy)
})
