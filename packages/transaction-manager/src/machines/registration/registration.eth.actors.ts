/**
 * Standalone-HCA funding from native ETH through CoW Protocol.
 *
 * EthFlow escrows the wallet's ETH in one transaction. CoW solvers deliver
 * the exact USDC shortfall directly to the HCA, so registration continues
 * without an intermediate wallet balance or EIP-2612 funding permit.
 */

import {
  type EnrichedOrder,
  OrderBookApi,
  OrderStatus,
  SupportedChainId,
} from '@cowprotocol/cow-sdk'
import { getDestinationContracts } from '@ens-apps/smart-account'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, fromPromise, ok, ResultAsync } from 'neverthrow'
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  type Hash,
  type PublicClient,
  parseAbi,
  type WalletClient,
  zeroHash,
} from 'viem'
import {
  estimateFeesPerGas,
  getBalance,
  readContract,
  waitForTransactionReceipt,
} from 'viem/actions'
import {
  type CowSellToken,
  type CowSwapHooks,
  type CowSwapOrder,
  type CowSwapQuote,
  ETH_SWAP_DISPLAYED_DRIFT_BPS,
  type EthSwapUnavailableError,
  NATIVE_ETH,
  quoteCowSwap,
  refundExpiredEthSwap,
  submitCowSwap,
  withBps,
} from '../../helpers/eth-usdc-swap'
import type { Signer } from '../../types/signer.types'
import type { PermitSignature } from './registration.actors'

export interface EthFunding {
  /** Token the wallet sells. Missing only on snapshots from the ETH-only build. */
  readonly sellToken?: CowSellToken
  /** The most sell-token units checkout showed the order spending. */
  readonly displayedCharge?: bigint
}

export type EthPaymentQuote = Readonly<{
  /** Exact USDC (6dp) CoW must deliver to the HCA. */
  usdcToBuy: bigint
  swap?: CowSwapQuote
}>

/** Persisted from EthFlow submission until CoW settlement is observed. */
export type PendingEthSwap = CowSwapOrder

const COW_POLL_MS = 4_000
const MAX_COW_FUNDING_ATTEMPTS = 3
const GAS_RESERVE_UNITS = 500_000n
export const ETH_SWAP_GAS_RESERVE_MULTIPLIER = 2n
// The live Sepolia USDC permit uses ~169k gas from a cold state. The old 100k
// cap made the solver's pre-hook fail, which then forced a fallback approval.
const USDC_PERMIT_HOOK_GAS = 250_000
const ENS_COMMIT_HOOK_GAS = 200_000

const permitAbi = parseAbi([
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
])
const commitAbi = parseAbi(['function commit(bytes32 commitment)'])

/**
 * Hooks attached to the exact CoW order used by the EOA registration flow.
 * The permit lets ENS pull the USDC CoW delivers without an approval tx. The
 * commit starts ENS's cooldown in the same settlement transaction. Both hooks
 * are verified on-chain after settlement and have ordinary transaction
 * fallbacks because CoW hook failure does not revert a settlement.
 */
export const buildRegistrationCowHooks = (input: {
  readonly chainId: number
  readonly permit?: PermitSignature
  readonly commitment?: Hash
}): CowSwapHooks | undefined => {
  const contracts = getDestinationContracts(input.chainId)
  const pre = input.permit
    ? [
        {
          target: contracts.usdc,
          callData: encodeFunctionData({
            abi: permitAbi,
            functionName: 'permit',
            args: [
              input.permit.owner,
              input.permit.spender,
              input.permit.value,
              input.permit.deadline,
              input.permit.v,
              input.permit.r,
              input.permit.s,
            ],
          }),
          gasLimit: USDC_PERMIT_HOOK_GAS,
        },
      ]
    : undefined
  const post = input.commitment
    ? [
        {
          target: contracts.ethRegistrar,
          callData: encodeFunctionData({
            abi: commitAbi,
            functionName: 'commit',
            args: [input.commitment],
          }),
          gasLimit: ENS_COMMIT_HOOK_GAS,
        },
      ]
    : undefined
  return pre || post ? { pre, post } : undefined
}

/**
 * Quote-time stand-ins with the exact targets, calldata sizes and gas limits
 * of the EOA registration hooks. The signatures and commitment are never
 * submitted; they only make checkout price the same work the real order asks
 * solvers to execute later.
 */
const buildRegistrationCowQuoteHooks = (input: {
  readonly chainId: number
  readonly owner: Address
  readonly permitValue: bigint
}): CowSwapHooks =>
  buildRegistrationCowHooks({
    chainId: input.chainId,
    permit: {
      owner: input.owner,
      spender: getDestinationContracts(input.chainId).ethRegistrar,
      value: input.permitValue,
      deadline: 0n,
      v: 27,
      r: zeroHash,
      s: zeroHash,
    },
    commitment: zeroHash,
  }) ?? { pre: [], post: [] }

export class EthSwapPaymentError extends TaggedError('EthSwapPaymentError')<{
  readonly message: string
  readonly cause: unknown
}> {}

const paymentError = (message: string, cause?: unknown) =>
  new EthSwapPaymentError({ message, cause })

const toError = (cause: unknown): EthSwapPaymentError =>
  paymentError(cause instanceof Error ? cause.message : String(cause), cause)

export const usdcToBuy = (target: bigint, hcaUsdc: bigint): bigint =>
  target > hcaUsdc ? target - hcaUsdc : 0n

export function rejectEthSwap(params: {
  readonly maximumEth: bigint
  readonly displayedCharge?: bigint
  readonly walletBalance: bigint
  readonly gasReserve: bigint
  readonly decimals?: number
  readonly symbol?: string
}): string | undefined {
  const {
    maximumEth,
    displayedCharge,
    walletBalance,
    gasReserve,
    decimals = 18,
    symbol = 'ETH',
  } = params
  if (
    displayedCharge !== undefined &&
    maximumEth > withBps(displayedCharge, ETH_SWAP_DISPLAYED_DRIFT_BPS)
  ) {
    return (
      `Paying now takes up to ${formatUnits(maximumEth, decimals)} ${symbol}, but ` +
      `${formatUnits(displayedCharge, decimals)} ${symbol} was shown at checkout. ` +
      'Please start again.'
    )
  }
  if (walletBalance < maximumEth + gasReserve) {
    return `Not enough ${symbol} in your wallet for this payment.`
  }
  return undefined
}

/** Quote the exact USDC amount that CoW will send directly to `hca`. */
export const quoteEthPaymentActor = ResultFn(async function* (input: {
  readonly owner: Address
  readonly hca: Address
  readonly permitValue: bigint
  readonly publicClient: PublicClient
  readonly chainId: number
  readonly sellToken?: CowSellToken
  readonly hooks?: CowSwapHooks
  /** Price the EOA permit + ENS commit hooks into the checkout quote. */
  readonly includeRegistrationHooks?: boolean
}) {
  if (input.permitValue === 0n) {
    return ok<EthPaymentQuote>({ usdcToBuy: 0n })
  }
  const swap = yield* quoteCowSwap({
    publicClient: input.publicClient,
    chainId: input.chainId,
    owner: input.owner,
    receiver: input.hca,
    amountOut: input.permitValue,
    sellToken: input.sellToken ?? NATIVE_ETH,
    hooks:
      input.hooks ??
      (input.includeRegistrationHooks
        ? buildRegistrationCowQuoteHooks(input)
        : undefined),
  })
  return ok<EthPaymentQuote>({ usdcToBuy: input.permitValue, swap })
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

export const quoteEthSwapGasReserve = (input: {
  readonly publicClient: PublicClient
  readonly chainId: number
  readonly owner: Address
  readonly swap: CowSwapQuote
}): ResultAsync<bigint, EthSwapPaymentError | EthSwapUnavailableError> =>
  ResultAsync.fromPromise(estimateFeesPerGas(input.publicClient), (cause) =>
    paymentError('Could not estimate the EthFlow network fee.', cause),
  ).map(
    (fees) =>
      GAS_RESERVE_UNITS * fees.maxFeePerGas * ETH_SWAP_GAS_RESERVE_MULTIPLIER,
  )

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('The registration was cancelled.'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason ?? new Error('The registration was cancelled.'))
      },
      { once: true },
    )
  })

const supportedChain = (chainId: number): SupportedChainId | undefined =>
  chainId === SupportedChainId.MAINNET || chainId === SupportedChainId.SEPOLIA
    ? chainId
    : undefined

type CowSettlementInput = {
  publicClient: PublicClient
  walletClient: WalletClient
  chainId: number
  order: PendingEthSwap
  signal?: AbortSignal
}

type CowSettlementOutcome = 'fulfilled' | 'dead'

const refundExpiredOrder = async (
  input: CowSettlementInput,
  order: EnrichedOrder,
): Promise<void> => {
  if (input.order.kind !== 'native') return
  const refund = await refundExpiredEthSwap({
    publicClient: input.publicClient,
    walletClient: input.walletClient,
    chainId: input.chainId,
    order,
  })
  if (refund.isErr()) throw refund.error
  const receipt = await waitForTransactionReceipt(input.publicClient, {
    hash: refund.value,
  })
  if (receipt.status !== 'success') {
    throw paymentError('The expired EthFlow refund failed on-chain.')
  }
}

const waitForCowSettlement = async (
  input: CowSettlementInput,
  orderBook: OrderBookApi,
): Promise<CowSettlementOutcome> => {
  while (true) {
    input.signal?.throwIfAborted()
    const order = await orderBook
      .getOrder(input.order.orderId)
      .catch(() => null)
    if (order) {
      if (order.status === OrderStatus.FULFILLED) return 'fulfilled'
      if (order.status === OrderStatus.CANCELLED) return 'dead'
      if (order.status === OrderStatus.EXPIRED) {
        await refundExpiredOrder(input, order)
        return 'dead'
      }
    }
    // The API can briefly 404 while the on-chain order indexes. Even after
    // expiry, its enriched order is needed to build the safe refund call.
    await sleep(COW_POLL_MS, input.signal)
  }
}

/** Wait for the EthFlow transaction and then for a solver settlement. */
const settleCowOrder = async (
  input: CowSettlementInput,
): Promise<CowSettlementOutcome> => {
  if (input.order.hash) {
    const receipt = await waitForTransactionReceipt(input.publicClient, {
      hash: input.order.hash,
    })
    if (receipt.status !== 'success') {
      throw paymentError('The EthFlow transaction failed on-chain.')
    }
  }
  const chainId = supportedChain(input.chainId)
  if (!chainId) {
    throw paymentError('CoW funding is not available on this network.')
  }
  return waitForCowSettlement(input, new OrderBookApi({ chainId }))
}

const readHcaBalance = (input: {
  publicClient: PublicClient
  chainId: number
  hca: Address
}) =>
  readContract(input.publicClient, {
    address: getDestinationContracts(input.chainId).usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [input.hca],
  })

const readSellTokenBalance = (input: {
  publicClient: PublicClient
  owner: Address
  token: CowSellToken
}) =>
  input.token.isNative
    ? getBalance(input.publicClient, { address: input.owner })
    : readContract(input.publicClient, {
        address: input.token.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [input.owner],
      })

/**
 * Fund the registration receiver's USDC budget through CoW Protocol.
 * Resolves only after the receiver balance proves settlement. An expired or
 * cancelled order is re-quoted instead of being mistaken for a successful
 * payment.
 */
export const swapEthForUsdcActor = ResultFn(async function* (input: {
  readonly hca: Address
  readonly targetBalance: bigint
  readonly funding?: EthFunding
  readonly approvalSigner: Signer
  readonly publicClient: PublicClient
  readonly pendingSwap?: PendingEthSwap
  /** EOA-only ENS permit + commit interactions bound to the CoW order. */
  readonly registrarPermit?: PermitSignature
  readonly commitment?: Hash
  /** HCA credits top up; EOA checkout must spend the token the user selected. */
  readonly fundingMode?: 'topUp' | 'exact'
  readonly onSwapSent?: (swap: PendingEthSwap) => void
  readonly signal?: AbortSignal
}) {
  const wallet = walletOf(input.approvalSigner)
  if (wallet instanceof EthSwapPaymentError) return err(wallet)
  const { chain } = input.publicClient
  if (!chain) return err(paymentError('Paying with ETH needs the app chain.'))
  const sellToken = input.funding?.sellToken ?? NATIVE_ETH
  const hooks = buildRegistrationCowHooks({
    chainId: chain.id,
    permit: input.registrarPermit,
    commitment: input.commitment,
  })
  const fundingMode = input.fundingMode ?? 'topUp'
  let exactAmountRemaining = input.targetBalance

  if (input.pendingSwap) {
    const pendingOutcome = yield* fromPromise(
      settleCowOrder({
        publicClient: input.publicClient,
        walletClient: wallet.client,
        chainId: chain.id,
        order: input.pendingSwap,
        signal: input.signal,
      }),
      toError,
    )
    if (fundingMode === 'exact' && pendingOutcome === 'fulfilled') {
      // New orders persist their exact output. The fallback safely migrates
      // old ETH-only snapshots, whose order represented the full checkout.
      const credited = input.pendingSwap.amountOut ?? input.targetBalance
      exactAmountRemaining =
        credited >= exactAmountRemaining ? 0n : exactAmountRemaining - credited
    }
  }

  let amountRequested = 0n
  for (let attempt = 0; attempt < MAX_COW_FUNDING_ATTEMPTS; attempt += 1) {
    const toBuy =
      fundingMode === 'exact'
        ? exactAmountRemaining
        : usdcToBuy(
            input.targetBalance,
            yield* fromPromise(
              readHcaBalance({
                publicClient: input.publicClient,
                chainId: chain.id,
                hca: input.hca,
              }),
              toError,
            ),
          )
    if (toBuy === 0n) return ok(amountRequested)
    if (amountRequested === 0n) amountRequested = toBuy

    const preview = yield* quoteEthPaymentActor({
      owner: wallet.address,
      hca: input.hca,
      permitValue: toBuy,
      publicClient: input.publicClient,
      chainId: chain.id,
      sellToken,
      hooks,
    })
    if (!preview.swap) return ok(amountRequested)

    const [walletBalance, gasReserve] = yield* ResultAsync.combine([
      fromPromise(
        readSellTokenBalance({
          publicClient: input.publicClient,
          owner: wallet.address,
          token: sellToken,
        }),
        (cause) => paymentError('Could not prepare the CoW order.', cause),
      ),
      sellToken.isNative
        ? quoteEthSwapGasReserve({
            publicClient: input.publicClient,
            chainId: chain.id,
            owner: wallet.address,
            swap: preview.swap,
          })
        : ResultAsync.fromSafePromise(Promise.resolve(0n)),
    ])
    const refusal = rejectEthSwap({
      maximumEth: preview.swap.maximumEth,
      // EthFlow is an on-chain value transfer, so the checkout quote is its
      // consent ceiling. ERC-20 funding is authorized later by an exact CoW
      // order signature (and, when needed, a bounded permit); rejecting a
      // fresh ERC-20 quote against a 30s-old UI quote only makes users sign the
      // registrar permit and then dead-ends on harmless network-cost movement.
      displayedCharge: sellToken.isNative
        ? input.funding?.displayedCharge
        : undefined,
      walletBalance,
      gasReserve,
      decimals: sellToken.decimals,
      symbol: sellToken.symbol,
    })
    if (refusal) return err(paymentError(refusal))
    if (input.signal?.aborted) {
      return err(paymentError('Cancelled before the swap.'))
    }

    const submitted = yield* submitCowSwap({
      publicClient: input.publicClient,
      walletClient: wallet.client,
      chainId: chain.id,
      owner: wallet.address,
      receiver: input.hca,
      amountOut: toBuy,
      sellToken,
      maximumSell: (() => {
        const solventMaximum = walletBalance - gasReserve
        // For ERC-20s this click-time quote becomes the authorization
        // baseline. submitCowSwap still refreshes it, caps the permit, and
        // binds the exact spend into the final CoW order signature.
        if (!sellToken.isNative) {
          const refreshedMaximum = withBps(
            preview.swap.maximumSell,
            ETH_SWAP_DISPLAYED_DRIFT_BPS,
          )
          return refreshedMaximum < solventMaximum
            ? refreshedMaximum
            : solventMaximum
        }
        if (input.funding?.displayedCharge === undefined) return solventMaximum
        const consentMaximum = withBps(
          input.funding.displayedCharge,
          ETH_SWAP_DISPLAYED_DRIFT_BPS,
        )
        return consentMaximum < solventMaximum ? consentMaximum : solventMaximum
      })(),
      hooks,
    })
    input.onSwapSent?.(submitted.order)

    const outcome = yield* fromPromise(
      settleCowOrder({
        publicClient: input.publicClient,
        walletClient: wallet.client,
        chainId: chain.id,
        order: submitted.order,
        signal: input.signal,
      }),
      toError,
    )
    if (fundingMode === 'exact' && outcome === 'fulfilled') {
      exactAmountRemaining =
        toBuy >= exactAmountRemaining ? 0n : exactAmountRemaining - toBuy
    }
  }

  return err(
    paymentError(
      'CoW Protocol could not settle this payment after several fresh quotes. Please try again.',
    ),
  )
})
