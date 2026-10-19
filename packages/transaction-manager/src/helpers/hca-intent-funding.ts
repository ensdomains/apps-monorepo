/**
 * Funding a ONE-OFF HCA intent on the user-paid route.
 *
 * The standalone-HCA deployment takes no gas sponsorship: every intent is paid
 * in USDC out of the HCA's own balance (`sponsored: { gas:false, bridging:false,
 * swaps:false }`, `feeAsset: 'USDC'`). Registration funds that balance inside
 * its commit leg, sized by `estimateHcaBudget` — but the budget carries no
 * buffer, so once a registration settles the HCA is left holding ~nothing.
 *
 * Any LATER standalone action (change the primary name, change a resolver,
 * renew a name) will therefore find an empty HCA and cannot pay for itself. The
 * planner will not even price an intent for an account sitting below the fee, so
 * it fails before it is ever submitted. This module closes that gap by re-using
 * registration's funding shape for a single arbitrary batch: quote the fee, and
 * when the HCA cannot cover what the batch spends, pull exactly the shortfall in
 * from the owner's wallet with an EIP-2612 permit + `transferFrom` pair carried
 * inside the SAME intent.
 *
 * An intent that BUYS something (`requiredUsdc` — a renewal's rent) spends from
 * the HCA twice over: the rent the action pulls, and the rail's fee. Both come
 * out of the same balance, so the funding is sized over both. The shortfall is
 * always shown to the user before anything is signed, then pulled under either
 * a permit signed for exactly that amount or a standing allowance that already
 * covers it (in which case only the `transferFrom` is needed). A spend in
 * another token (`tokenSpend`) is funded the same way, as a leg of its own.
 *
 * Sponsorship is deliberately NOT the answer here — see `signer.types.ts`.
 */

import {
  getDestinationContracts,
  legFeeUsdc,
  readQuotedGasRefunds,
} from '@ens-apps/smart-account'
import type { Transaction } from '@rhinestone/sdk'
import type { Address, Chain, Hex, PublicClient } from 'viem'
import {
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  isAddressEqual,
  parseAbi,
  zeroAddress,
} from 'viem'
import { readContract } from 'viem/actions'
import {
  type PermitKind,
  type PermitPurpose,
  type PermitValueBounds,
  readHcaUsdcBalanceActor,
  readUsdcSpend,
  signFundingPermitForTokenActor,
} from '../machines/registration/registration.hca.actors'
import type { RhinestoneSigner, Signer } from '../types/signer.types'
import type { Call } from '../types/transaction.types'

const erc2612Abi = parseAbi([
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
])

/**
 * DAI's pre-EIP-2612 `permit` (selector `0x8fcbaf0c`). Separate from the ABI
 * above because both overloads are named `permit` and their argument tuples are
 * different lengths — keeping them apart makes the encoded shape explicit.
 */
const daiPermitAbi = parseAbi([
  'function permit(address holder, address spender, uint256 nonce, uint256 expiry, bool allowed, uint8 v, bytes32 r, bytes32 s)',
])

/**
 * Gas LIMIT for a small standalone reverse/resolver intent, quoted against the
 * fully-funded shape (permit + transferFrom + up to two adapter calls) plus the
 * HCA's own execution overhead. The rail prices the quote on this LIMIT, so it
 * must cover the batch or the permit is sized short and the fill fails.
 */
export const HCA_STANDALONE_INTENT_GAS_LIMIT = 300_000n

/**
 * Ceiling (USDC, 6dp) on what a standalone intent's fee may be quoted at.
 *
 * Same reasoning as `HCA_MAX_LEG_FEES_USDC` on the registration budget: the fee
 * is read out of an orchestrator HTTP response and becomes the value of an
 * EIP-2612 permit, so it needs a bound derived without that response. These are
 * small fixed-shape intents (one or two adapter calls under a 300k gas limit),
 * which fill for well under 1 USDC on Sepolia; 10 USDC is far above anything a
 * legitimate gas regime produces — `HCA_STANDALONE_INTENT_GAS_LIMIT` at the
 * 5 gwei clamp used elsewhere is ~0.0015 ETH, about 6 USDC at $4000/ETH.
 *
 * There is no on-chain price component here (nothing is being bought), so
 * unlike the registration budget the whole bound is the fee margin.
 */
export const HCA_MAX_STANDALONE_INTENT_FEE_USDC = 10_000_000n

/**
 * Fee ceiling (USDC, 6dp) per million gas declared above the 300k anchor: ~4x
 * the ~2.45 USDC per 1M gas Sepolia renewals were measured at. The anchor's own
 * rate carries fixed overhead, and would let a 25-name batch reach ~100 USDC.
 */
export const HCA_MAX_INTENT_FEE_USDC_PER_MGAS = 10_000_000n

const divCeil = (a: bigint, b: bigint): bigint => (a + b - 1n) / b

/**
 * Fee ceiling (USDC, 6dp) for an intent quoted against `gasLimit`, which the
 * rail prices on: the 300k anchor (scaled down for smaller shapes) plus
 * {@link HCA_MAX_INTENT_FEE_USDC_PER_MGAS} above it. Rounded up.
 */
export const hcaMaxIntentFeeUsdcFor = (gasLimit: bigint): bigint =>
  gasLimit <= HCA_STANDALONE_INTENT_GAS_LIMIT
    ? divCeil(
        HCA_MAX_STANDALONE_INTENT_FEE_USDC * gasLimit,
        HCA_STANDALONE_INTENT_GAS_LIMIT,
      )
    : HCA_MAX_STANDALONE_INTENT_FEE_USDC +
      divCeil(
        (gasLimit - HCA_STANDALONE_INTENT_GAS_LIMIT) *
          HCA_MAX_INTENT_FEE_USDC_PER_MGAS,
        1_000_000n,
      )

/**
 * What the user is shown before the wallet funds an intent.
 *
 * The permit is signed for EXACTLY {@link permitValue} — not a ceiling, not a
 * rounded-up allowance — so the figure on screen is the figure authorized.
 */
export interface HcaFundingPrompt {
  /** USDC (6dp) moved from the wallet: the shortfall the HCA cannot cover. */
  readonly permitValue: bigint
  /** `false` when a standing allowance covers the pull, so no permit follows. */
  readonly requiresPermit: boolean
  /** USDC (6dp) the orchestrator quoted for the whole intent. */
  readonly quotedFeeUsdc: bigint
  /** USDC (6dp) the HCA already holds, which offsets what the intent needs. */
  readonly hcaBalanceUsdc: bigint
  /**
   * USDC (6dp) the action itself spends from the HCA's balance — the rent a
   * renewal pulls, say. Zero for an intent that only pays its own fee.
   */
  readonly requiredUsdc: bigint
  /** Present when the action spends a token other than USDC; the fee stays USDC. */
  readonly token?: HcaFundingTokenLeg
}

/** The non-USDC half of a prompt, in that token's own units. */
export interface HcaFundingTokenLeg {
  readonly symbol: string
  readonly decimals: number
  /** What the action spends in this token. */
  readonly required: bigint
  /** What the HCA already holds of it. */
  readonly hcaBalance: bigint
  /** Moved from the wallet: what the HCA is short. Zero when it is covered. */
  readonly permitValue: bigint
  readonly requiresPermit: boolean
  /**
   * `true` when the permit cannot be scoped to {@link permitValue}: mainnet
   * DAI's legacy permit only grants an unlimited, non-depleting allowance, so
   * the prompt must say so instead of promising an exact amount.
   */
  readonly unlimitedAllowance?: boolean
}

/** What an intent's calls spend in one token, on top of the USDC fee. */
export interface HcaTokenSpend {
  readonly token: Address
  readonly symbol: string
  readonly decimals: number
  readonly amount: bigint
  /** The permit the token implements. Defaults to EIP-2612. */
  readonly permitKind?: PermitKind
}

/** The user saw the funding amount and declined it. Not an error condition. */
export class HcaFundingDeclinedError extends Error {
  constructor() {
    super('Funding was not approved, so no signature was requested.')
    this.name = 'HcaFundingDeclinedError'
  }
}

/** The orchestrator quoted a fee above {@link HCA_MAX_STANDALONE_INTENT_FEE_USDC}. */
export class HcaIntentFeeExceedsMaximumError extends Error {
  readonly quotedFeeUsdc: bigint
  readonly expectedMaximum: bigint

  constructor(quotedFeeUsdc: bigint, expectedMaximum: bigint) {
    super(
      `Refusing to request a signature: the payment relayer quoted ` +
        `${formatUnits(quotedFeeUsdc, 6)} USDC for this action, above the ` +
        `expected maximum of ${formatUnits(expectedMaximum, 6)} USDC. ` +
        `Please try again in a moment.`,
    )
    this.name = 'HcaIntentFeeExceedsMaximumError'
    this.quotedFeeUsdc = quotedFeeUsdc
    this.expectedMaximum = expectedMaximum
  }
}

/** `Math.max` for bigints (no bigint overload on `Math.max`). */
const bigintMax = (a: bigint, b: bigint): bigint => (a > b ? a : b)

/**
 * Balance (USDC, 6dp) the first-pass quote pretends the HCA will hold: what the
 * action spends, plus the fee ceiling for the declared limit.
 *
 * The planner refuses to price an account it sees as unable to pay, and the fee
 * it prices scales with `gasLimit` — a fixed placeholder clears the 300k shape
 * but not a renewal batch, whose fee is several times larger, so the intent
 * would fail to quote before the user was ever asked to fund it. The action's
 * own spend is included because its calls run against this same simulated
 * balance. Nothing here is permitted: the permit is sized from the quote this
 * produces, never from this number.
 */
const firstPassBalanceUsdc = (requiredUsdc: bigint, gasLimit: bigint): bigint =>
  requiredUsdc + hcaMaxIntentFeeUsdcFor(gasLimit)

/**
 * A permit whose SHAPE matches the real one but whose values are dummies.
 *
 * Quoting is a chicken-and-egg problem: the permit's value is the fee, and the
 * fee comes from the quote. It resolves because every `permit` argument is
 * fixed-width, so the calldata length — and therefore the quoted cost — is
 * identical whatever value we eventually sign for. Quote with the placeholder,
 * then sign the real permit for the amount it reports. DAI's legacy permit has
 * one more argument, so its placeholder must be that shape too.
 */
const placeholderPermitCalls = (
  token: Address,
  owner: Address,
  hca: Address,
  kind: PermitKind = 'eip2612',
): Call[] => [
  {
    to: token,
    value: 0n,
    data:
      kind === 'dai-legacy'
        ? encodeFunctionData({
            abi: daiPermitAbi,
            functionName: 'permit',
            args: [
              owner,
              hca,
              0n,
              1_800_000_000n,
              true,
              27,
              `0x${'11'.repeat(32)}` as Hex,
              `0x${'22'.repeat(32)}` as Hex,
            ],
          })
        : encodeFunctionData({
            abi: erc2612Abi,
            functionName: 'permit',
            args: [
              owner,
              hca,
              1_000_000n,
              1_800_000_000n,
              27,
              `0x${'11'.repeat(32)}` as Hex,
              `0x${'22'.repeat(32)}` as Hex,
            ],
          }),
  },
  {
    to: token,
    value: 0n,
    data: encodeFunctionData({
      abi: erc2612Abi,
      functionName: 'transferFrom',
      args: [owner, hca, 1_000_000n],
    }),
  },
]

/** The subset of `prepareTransaction`'s response this module reads. */
type PreparedQuote = {
  readonly intentRoute?: {
    readonly intentCost?: Parameters<typeof readUsdcSpend>[0]
    readonly intentOp?: {
      readonly signedMetadata?: {
        readonly gasPrices?: Readonly<Record<string, string>>
      }
    }
  }
}

/**
 * Quote what the orchestrator will actually pull for `calls`, in USDC (6dp).
 *
 * The quoted spend leaves out the relay fee carried in the refund overhead,
 * so the fee is sized from both, as the registration legs are (`legFeeUsdc`).
 *
 * `auxiliaryFunds` declares the inflow the funding pair brings in, because the
 * planner credits only balances it can already see and otherwise refuses to
 * price an intent for an HCA sitting below the fee.
 */
async function quoteIntentUsdc(input: {
  account: RhinestoneSigner['account']
  chain: Chain
  calls: readonly Call[]
  declaredInflow: bigint
  /** Declared limit the rail prices the quote against. */
  gasLimit: bigint
}): Promise<bigint | null> {
  const { account, chain, calls, declaredInflow, gasLimit } = input
  const usdc = getDestinationContracts(chain.id).usdc

  const prepared = (await account.prepareTransaction({
    sourceChains: [chain],
    targetChain: chain,
    calls: [...calls],
    sponsored: { gas: false, bridging: false, swaps: false },
    feeAsset: 'USDC',
    tokenRequests: [],
    gasLimit,
    ...(declaredInflow > 0n
      ? {
          auxiliaryFunds: {
            [chain.id]: { [usdc]: declaredInflow },
          } as Transaction['auxiliaryFunds'],
        }
      : {}),
  } as Transaction)) as PreparedQuote

  const route = prepared.intentRoute
  const spend = readUsdcSpend(route?.intentCost, chain.id)
  if (spend === null) return null
  const gasPrice =
    route?.intentOp?.signedMetadata?.gasPrices?.[String(chain.id)]
  return legFeeUsdc({
    spendUsdc: spend,
    gasLimit,
    gasPriceWei: gasPrice ? BigInt(gasPrice) : undefined,
    gasRefund: readQuotedGasRefunds(route).find(
      (refund) => !isAddressEqual(refund.token, zeroAddress),
    ),
  })
}

export interface HcaIntentFunding {
  /** The batch to submit: `calls`, preceded by each funding pair needed. */
  readonly calls: readonly Call[]
  /** USDC (6dp) this intent pulls in. Absent when no funding was needed. */
  readonly incomingUsdc?: bigint
  /**
   * Ready-made `rhinestoneParams.auxiliaryFunds` for the inflow above — the
   * planner refuses to price an HCA that cannot cover the fee out of balances
   * it can already see, so this must be spread into the request whenever the
   * funding pair is present. Absent when no funding was needed.
   */
  readonly auxiliaryFunds?: Readonly<
    Record<number, Readonly<Record<Address, bigint>>>
  >
  /** The quoted fee, for logging/telemetry. */
  readonly quotedFeeUsdc: bigint
}

export interface PlanHcaIntentFundingParams {
  /** The HCA signer the intent runs on. */
  readonly signer: RhinestoneSigner
  /** The owner EOA whose wallet funds the shortfall. */
  readonly ownerAddress: Address
  /** Owner wallet client, as an EOA signer — signs the EIP-2612 permit. */
  readonly approvalSigner: Signer
  readonly publicClient: PublicClient
  readonly chainId: number
  /** The action calls. The funding pair, when needed, is prepended to these. */
  readonly calls: readonly Call[]
  /**
   * USDC (6dp) the calls themselves spend out of the HCA's balance, on top of
   * the fee — a renewal's rent, say. The funding is sized over both, because
   * both come out of the same balance. Defaults to zero (an action that buys
   * nothing).
   */
  readonly requiredUsdc?: bigint
  /**
   * What the calls spend in a token of their choosing — a renewal's rent. In
   * USDC it joins `requiredUsdc`; any other token is funded as its own leg.
   */
  readonly tokenSpend?: HcaTokenSpend
  /**
   * Declared gas limit the rail prices the quote against. Defaults to
   * {@link HCA_STANDALONE_INTENT_GAS_LIMIT}; pass a larger one for a batch the
   * default would under-fund.
   */
  readonly gasLimit?: bigint
  /**
   * Ceiling on the quoted fee before it can become a permit value. Defaults to
   * {@link HCA_MAX_STANDALONE_INTENT_FEE_USDC}; pass
   * {@link hcaMaxIntentFeeUsdcFor} of a non-default `gasLimit`.
   */
  readonly maxFeeUsdc?: bigint
  /**
   * Show the user the USDC the intent moves out of their wallet and wait for a
   * decision. Called whenever the wallet funds the intent (by permit or by a
   * standing allowance), after the quote and BEFORE any signature; returning
   * `false` aborts with {@link HcaFundingDeclinedError} and nothing is signed.
   *
   * Optional so non-interactive callers still work, but any flow that leads to
   * a wallet signature should supply it: otherwise the user approves a
   * fund-moving permit for an amount they were never shown.
   */
  readonly confirmFunding?: (
    prompt: HcaFundingPrompt,
  ) => Promise<boolean> | boolean
  /**
   * What the funding pays for, as the permit's errors describe it. Defaults to
   * {@link STANDALONE_INTENT_PERMIT_PURPOSE}.
   */
  readonly purpose?: PermitPurpose
}

export type { PermitKind, PermitPurpose }

/** How a permit's errors describe a standalone intent with no purpose of its own. */
export const STANDALONE_INTENT_PERMIT_PURPOSE: PermitPurpose = {
  subject: 'this action',
  shownAt: 'before you approved it',
  costNote:
    'The amount covers what the action spends plus its network fee, less ' +
    'what the smart account already holds.',
}

/** One token the wallet tops the HCA up with. */
type FundingLeg = {
  readonly token: Address
  readonly symbol: string
  readonly decimals: number
  /** What the HCA is short of this token. */
  readonly shortfall: bigint
  /** `false` when a standing allowance on the wallet already covers the pull. */
  readonly requiresPermit: boolean
  readonly permitKind: PermitKind
}

/**
 * How the wallet funds one leg: a standing allowance when one covers it, else a
 * permit. Checks the wallet holds it first, so nothing shown to the user (or
 * signed by them) can then fail for want of funds.
 */
async function planFundingLeg(
  owner: { publicClient: PublicClient; ownerAddress: Address; hca: Address },
  leg: Omit<FundingLeg, 'requiresPermit'>,
): Promise<FundingLeg> {
  const [allowance, walletBalance] = await Promise.all([
    readContract(owner.publicClient, {
      address: leg.token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner.ownerAddress, owner.hca],
    }),
    readContract(owner.publicClient, {
      address: leg.token,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [owner.ownerAddress],
    }),
  ])
  if (walletBalance < leg.shortfall) {
    throw new Error(
      `This action needs ${formatUnits(leg.shortfall, leg.decimals)} ` +
        `${leg.symbol} moved into the smart account, but the connected ` +
        `wallet holds ${formatUnits(walletBalance, leg.decimals)} ${leg.symbol}.`,
    )
  }
  return { ...leg, requiresPermit: allowance < leg.shortfall }
}

/** The calls that move one leg into the HCA: its permit when needed, then the pull. */
async function legCalls(
  leg: FundingLeg,
  input: {
    ownerAddress: Address
    hca: Address
    approvalSigner: Signer
    publicClient: PublicClient
    chainId: number
  },
  bounds: PermitValueBounds,
  purpose: PermitPurpose,
): Promise<Call[]> {
  const pull: Call = {
    to: leg.token,
    value: 0n,
    data: encodeFunctionData({
      abi: erc2612Abi,
      functionName: 'transferFrom',
      args: [input.ownerAddress, input.hca, leg.shortfall],
    }),
  }
  if (!leg.requiresPermit) return [pull]

  const permit = await signFundingPermitForTokenActor({
    wallet: input.ownerAddress,
    hca: input.hca,
    value: leg.shortfall,
    approvalSigner: input.approvalSigner,
    publicClient: input.publicClient,
    chainId: input.chainId,
    token: {
      address: leg.token,
      symbol: leg.symbol,
      decimals: leg.decimals,
      permitKind: leg.permitKind,
    },
    bounds,
    purpose,
  }).match(
    (signed) => signed,
    (error) => {
      throw error
    },
  )

  const data =
    permit.kind === 'dai-legacy'
      ? encodeFunctionData({
          abi: daiPermitAbi,
          functionName: 'permit',
          args: [
            permit.holder,
            permit.spender,
            permit.nonce,
            permit.expiry,
            permit.allowed,
            permit.v,
            permit.r,
            permit.s,
          ],
        })
      : encodeFunctionData({
          abi: erc2612Abi,
          functionName: 'permit',
          args: [
            permit.owner,
            permit.spender,
            permit.value,
            permit.deadline,
            permit.v,
            permit.r,
            permit.s,
          ],
        })

  return [{ to: leg.token, value: 0n, data }, pull]
}

/**
 * Size and attach funding for a standalone HCA intent.
 *
 * Quotes the FULLY-FUNDED batch every time, then drops the funding pair if the
 * HCA turns out to already cover the fee. Quoting the shape you might submit —
 * rather than the bare action — is what keeps the permit from being sized
 * against a smaller batch than the one that fills.
 *
 * Throws rather than guessing: an unpriceable quote means the permit amount is
 * unknown, and a wrong permit either under-funds (the fill reverts) or moves
 * more of the user's USDC into the HCA than the action needed.
 */
export async function planHcaIntentFunding(
  params: PlanHcaIntentFundingParams,
): Promise<HcaIntentFunding> {
  const {
    signer,
    ownerAddress,
    publicClient,
    chainId,
    calls,
    requiredUsdc: usdcSpend = 0n,
    tokenSpend,
    gasLimit = HCA_STANDALONE_INTENT_GAS_LIMIT,
    maxFeeUsdc = HCA_MAX_STANDALONE_INTENT_FEE_USDC,
  } = params

  const chain = publicClient.chain
  if (!chain) {
    throw new Error('Cannot fund an HCA intent without a chain-bound client.')
  }

  const hca = signer.account.getAddress() as Address
  const usdc = getDestinationContracts(chainId).usdc

  // A USDC spend shares the fee's funding; any other token is a leg of its own.
  const otherSpend =
    tokenSpend && !isAddressEqual(tokenSpend.token, usdc)
      ? tokenSpend
      : undefined
  const requiredUsdc =
    usdcSpend + (tokenSpend && !otherSpend ? tokenSpend.amount : 0n)

  // Deliberately NOT `unwrapOr(0n)`: an unread balance is unknown, not empty.
  // `balance` sets the shortfall the permit is signed for, so defaulting it to
  // zero on a failed read is exactly the guess this function refuses to make
  // elsewhere — it would pull the full fee out of the owner's wallet into an
  // HCA that may already have been holding it.
  const balance = await readHcaUsdcBalanceActor({
    hca,
    publicClient,
    chainId,
  }).match(
    (value) => value,
    (error) => {
      throw error
    },
  )

  // Same for the other token: a failed read throws rather than reading as zero.
  const tokenBalance = otherSpend
    ? await readContract(publicClient, {
        address: otherSpend.token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [hca],
      })
    : 0n

  const fundedCalls: Call[] = [
    ...placeholderPermitCalls(usdc, ownerAddress, hca),
    ...(otherSpend
      ? placeholderPermitCalls(
          otherSpend.token,
          ownerAddress,
          hca,
          otherSpend.permitKind,
        )
      : []),
    ...calls,
  ]

  // First-pass inflow: tops the HCA up to what the intent could conceivably
  // need — the rent, plus the fee ceiling for the declared limit — so the
  // planner sees it as covered and prices the legs at all. The real permit is
  // sized from the quote this produces, never from this number.
  //
  // Keyed on "below the target", NOT on "exactly zero". The planner refuses to
  // price ANY account sitting under the fee, so a dust balance — say 0.3 USDC
  // against a 0.9 fee — is just as unpriceable as an empty one, and declaring
  // nothing there made the quote fail and this function throw. A settled
  // registration lands squarely in that band.
  //
  // Declaring an inflow for an HCA that turns out to cover the cost anyway is
  // harmless: the quote prices on `gasLimit`, so the fee comes back the same,
  // and the `balance >= targetUsdc` branch below then drops the funding pair.
  const quoteBalanceUsdc = firstPassBalanceUsdc(requiredUsdc, gasLimit)
  const declaredInflow =
    balance >= quoteBalanceUsdc ? 0n : quoteBalanceUsdc - balance

  const quotedFeeUsdc = await quoteIntentUsdc({
    account: signer.account,
    chain,
    calls: fundedCalls,
    declaredInflow,
    gasLimit,
  })

  if (quotedFeeUsdc === null) {
    throw new Error(
      'Could not quote the HCA intent, so the funding permit cannot be sized. ' +
        'Refusing to fall back to a guessed amount.',
    )
  }

  // Bound the orchestrator's figure against one derived without it, before it
  // can become a permit value. Checked even when the HCA turns out to cover the
  // fee: a quote this far out is evidence the response is wrong, and the same
  // number sizes nothing else worth trusting.
  if (quotedFeeUsdc > maxFeeUsdc) {
    throw new HcaIntentFeeExceedsMaximumError(quotedFeeUsdc, maxFeeUsdc)
  }

  // What the intent needs out of the HCA: what it buys (`requiredUsdc`) plus
  // the rail's fee. Both are pulled from the same balance, so the funding is
  // sized over the sum.
  const targetUsdc = requiredUsdc + quotedFeeUsdc
  const usdcShortfall = bigintMax(targetUsdc - balance, 0n)
  const tokenShortfall = otherSpend
    ? bigintMax(otherSpend.amount - tokenBalance, 0n)
    : 0n

  if (usdcShortfall === 0n && tokenShortfall === 0n) {
    // The HCA already covers it — submit the bare action. The quote was taken
    // over a larger batch, so it only over-estimated, which is safe here
    // because nothing is being permitted.
    return { calls: [...calls], quotedFeeUsdc }
  }

  return fundShortfalls(params, {
    hca,
    usdc,
    balance,
    requiredUsdc,
    quotedFeeUsdc,
    maxFeeUsdc,
    usdcShortfall,
    otherSpend,
    tokenBalance,
    tokenShortfall,
  })
}

/** The quoted figures {@link fundShortfalls} funds against. */
type QuotedFunding = {
  readonly hca: Address
  readonly usdc: Address
  /** The HCA's USDC balance. */
  readonly balance: bigint
  readonly requiredUsdc: bigint
  readonly quotedFeeUsdc: bigint
  readonly maxFeeUsdc: bigint
  readonly usdcShortfall: bigint
  readonly otherSpend: HcaTokenSpend | undefined
  readonly tokenBalance: bigint
  readonly tokenShortfall: bigint
}

/** The non-USDC half of the prompt, flagging a permit that grants unlimited. */
const tokenPromptLeg = (
  spend: HcaTokenSpend,
  quoted: QuotedFunding,
  leg: FundingLeg | null,
): HcaFundingTokenLeg => ({
  symbol: spend.symbol,
  decimals: spend.decimals,
  required: spend.amount,
  hcaBalance: quoted.tokenBalance,
  permitValue: quoted.tokenShortfall,
  requiresPermit: leg?.requiresPermit ?? false,
  ...(leg?.requiresPermit && leg.permitKind === 'dai-legacy'
    ? { unlimitedAllowance: true }
    : {}),
})

/**
 * Plan each leg, show the amounts, then sign — in that order, so nothing is
 * signed for a figure the user did not see or a wallet that cannot pay it.
 */
async function fundShortfalls(
  params: PlanHcaIntentFundingParams,
  quoted: QuotedFunding,
): Promise<HcaIntentFunding> {
  const { ownerAddress, approvalSigner, publicClient, chainId, calls } = params
  const { hca, usdc, balance, requiredUsdc, usdcShortfall, otherSpend } = quoted

  const owner = { publicClient, ownerAddress, hca }
  const usdcLeg =
    usdcShortfall > 0n
      ? await planFundingLeg(owner, {
          token: usdc,
          symbol: 'USDC',
          decimals: 6,
          shortfall: usdcShortfall,
          permitKind: 'eip2612',
        })
      : null
  const tokenLeg =
    otherSpend && quoted.tokenShortfall > 0n
      ? await planFundingLeg(owner, {
          token: otherSpend.token,
          symbol: otherSpend.symbol,
          decimals: otherSpend.decimals,
          shortfall: quoted.tokenShortfall,
          permitKind: otherSpend.permitKind ?? 'eip2612',
        })
      : null

  // Show the amounts before anything is signed, permit or not: either way they
  // leave the wallet when the intent fills.
  const approved = await (params.confirmFunding?.({
    permitValue: usdcShortfall,
    requiresPermit: usdcLeg?.requiresPermit ?? false,
    quotedFeeUsdc: quoted.quotedFeeUsdc,
    hcaBalanceUsdc: balance,
    requiredUsdc,
    ...(otherSpend
      ? { token: tokenPromptLeg(otherSpend, quoted, tokenLeg) }
      : {}),
  }) ?? true)
  if (!approved) throw new HcaFundingDeclinedError()

  const signing = { ownerAddress, hca, approvalSigner, publicClient, chainId }
  const purpose = params.purpose ?? STANDALONE_INTENT_PERMIT_PURPOSE
  // Each permit is bounded by what `confirmFunding` just put on screen. Equal
  // by construction, so this asserts the two can never drift apart if these
  // steps reorder.
  const tokenCalls = tokenLeg
    ? await legCalls(
        tokenLeg,
        signing,
        { displayedValue: quoted.tokenShortfall },
        purpose,
      )
    : []
  const usdcCalls = usdcLeg
    ? await legCalls(
        usdcLeg,
        signing,
        {
          // The permit tops the HCA up to what the intent spends, so the
          // ceiling nets off the standing balance exactly as the value does,
          // over the same two components (what it buys, plus the bounded fee).
          expectedMaximum: bigintMax(
            requiredUsdc + quoted.maxFeeUsdc - balance,
            0n,
          ),
          displayedValue: usdcShortfall,
        },
        purpose,
      )
    : []

  return {
    calls: [...tokenCalls, ...usdcCalls, ...calls],
    ...(usdcShortfall > 0n
      ? {
          incomingUsdc: usdcShortfall,
          auxiliaryFunds: { [chainId]: { [usdc]: usdcShortfall } },
        }
      : {}),
    quotedFeeUsdc: quoted.quotedFeeUsdc,
  }
}
