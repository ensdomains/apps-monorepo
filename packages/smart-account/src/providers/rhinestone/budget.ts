/**
 * Runtime same-chain HCA funding-budget estimator.
 *
 * The wallet pre-funds the HCA (one EIP-2612 permit → `transferFrom`) with
 * enough USDC to cover the whole same-chain registration paid from the HCA's
 * own balance:
 *
 *     budget = commitLegCost           (commit intent, USDC the orchestrator
 *                                       actually pulls)
 *            + registerLegCost         (register intent, USDC)
 *            + registrationPrice       (the .eth rent, USDC)
 *
 * There is NO percentage buffer — see the `total` computation for why one would
 * be a guess layered on a derived number.
 *
 * PREFERRED sizing (`quoteLegCostUsdc`): each leg's USDC cost comes from
 * Rhinestone's own quote — `account.prepareTransaction(...)` returns the
 * quoted spend AND the gas refund the intent will be signed with, and
 * {@link legFeeUsdc} budgets the larger of the spend and what that refund lets
 * the executor pull. The spend alone leaves out the relay fee carried in the
 * refund overhead, which dominates when gas is cheap. This is immune to the
 * caller's local gas-price reads (Sepolia `getGasPrice()` spikes to ~20 gwei
 * even when the tx settles at ~1-2 gwei, which massively over-sizes a
 * gas×price model).
 *
 * A quote is only as good as the gas LIMIT it is taken at, since the rail never
 * inspects the calls — so {@link HCA_LEG_GAS_LIMITS} and
 * {@link registerLegGasLimit} are the real budget.
 *
 * FALLBACK sizing (no quoter, or the quote throws): price the leg from its gas
 * LIMIT × gas price × ETH/USDC — a rough upper bound, used only when the
 * orchestrator quote is unavailable. The gas price and unit prices come from
 * the SAME quote response (`intentOp.signedMetadata`), NOT from a separate
 * price service: the orchestrator's `/deposit-processor/prices` route is an
 * internal path with no CORS headers (its preflight 404s), so calling it from
 * a browser always failed and silently collapsed the estimate to a flat
 * per-leg fee that over-funded the HCA ~5x. It would also have leaked the API
 * key to every visitor.
 *
 * This is NOT the session refund CAP (`MAX_REFUND_AMOUNT`, baked into the
 * session salt) — that is a fixed ceiling. This is the actual USDC moved into
 * the HCA up front.
 */

import type { PublicClient } from 'viem'
import { formatUnits, isAddressEqual, zeroAddress } from 'viem'
import {
  BASE_SEPOLIA_CHAIN_ID,
  getDestinationContracts,
  SEPOLIA_CHAIN_ID,
} from './manifest'
import type { QuotedGasRefund } from './refund-caps'
import { readRegisterPrice } from './registration-calls'

/**
 * Per-leg gas LIMITS. Passed to `prepareTransaction({ gasLimit })` so the
 * orchestrator quotes against a bounded leg, and used by the fallback model.
 * Submitted intents carry no limit, so these only size the quote, never bound
 * execution: they are sized from the gas the executor BILLS for a fill, which
 * is the measured execution gas and runs below the transaction's `gasUsed`.
 */
export const HCA_LEG_GAS_LIMITS = {
  // Permit + transferFrom + commit, WITHOUT the conditional HCA deploy —
  // `commitLegGasLimit` adds that on top. A repeat commit billed 384_879 gas
  // on Sepolia, rounded up for headroom.
  commit: 450_000n,
  // Approve + register + record setters, WITHOUT the conditional resolver
  // deploy — `registerLegGasLimit` adds that on top.
  //
  // Sepolia reveal fills that deployed no resolver billed 1_148_902 and
  // 1_154_652 gas on 2026-10-06
  // (`0x570d87e352442bf9203f747a3f6496ebb828ed95eb58776eacb1b00b68fb80b1`,
  // `0x1c0722c8…`), rounded up for headroom. The previous 450_000 came from a
  // ~393k measurement the batch has since outgrown, and since the rail prices
  // the quote on this limit, it priced the leg at roughly half its real cost:
  // the permit then funded the HCA for that half, and the orchestrator refused
  // to plan a reveal the account could not pay for — a rejection with no
  // on-chain trace, identical on every retry.
  register: 1_250_000n,
} as const

/**
 * Gas for deploying the HCA itself, which the FIRST commit does alongside the
 * permit, transferFrom and commit.
 *
 * Two first-use Sepolia commits billed 663_019 and 662_734 gas against the
 * 384_879 a repeat commit bills, so the deploy costs ~278_000 in the batch;
 * rounded up for headroom. Leaving it unpriced under-funded the commit leg for
 * every new user, the same way {@link HCA_RESOLVER_DEPLOY_GAS} once did for
 * the reveal.
 */
export const HCA_ACCOUNT_DEPLOY_GAS = 300_000n

/** What varies in the commit batch, and therefore in what the leg costs. */
export interface CommitLegShape {
  /**
   * Whether the HCA already has code. Required, not defaulted: `false` is the
   * expensive case, and defaulting either way is what leaves a deploy unpriced.
   */
  readonly isHcaDeployed: boolean
}

/**
 * The `commit` leg's gas limit. Same rule as {@link registerLegGasLimit}: the
 * rail prices purely on the declared units, so a conditional call that is not
 * added here is not funded.
 */
export function commitLegGasLimit(shape: CommitLegShape): bigint {
  return (
    HCA_LEG_GAS_LIMITS.commit +
    (shape.isHcaDeployed ? 0n : HCA_ACCOUNT_DEPLOY_GAS)
  )
}

/**
 * Gas for the conditional `deployProxy` that `buildRevealBatch` prepends when
 * the HCA has no `PermissionedResolver` — i.e. on every FIRST registration.
 *
 * Measured as the difference between two Sepolia reveal fills on 2026-10-06:
 * 2_164_879 gas billed with the deploy
 * (`0xc03cb436c8fdf54792f06d8fa3525a51604913f5711334c29511527f06301873`,
 * and `0xe5745e1b…` within 546 gas of it) against ~1_150_000 without, so the
 * deploy costs ~1_015_000 in the batch; rounded up for headroom.
 *
 * The earlier 210_000 came from an `eth_estimateGas` of the factory call on
 * its own, which misses what the deploy costs inside the batch. Leaving it
 * unpriced altogether under-sized the permit by ~41% of the leg (Immunefi
 * #89462) — see {@link registerLegGasLimit} for why the quote cannot see it.
 */
export const HCA_RESOLVER_DEPLOY_GAS = 1_070_000n

/**
 * Gas for the first storage word of the primary name, plus the fixed overhead
 * of the `DefaultReverseRegistrarAdapter.setNameWithHCA` call in step 5 (the
 * HCA-factory authorization read, two hops of call overhead, and the event).
 *
 * Measured on a Sepolia fork against the deployed adapter `0x7a84e241…`, with
 * the HCA factory stubbed so `_requireHCAForAccount` passes, writing to an
 * address that holds no prior record — the case a registration actually hits:
 *
 *   name bytes | SSTOREs | execution gas
 *   -----------|---------|--------------
 *     <=31     |    1    |  34_624
 *      32      |    2    |  57_218
 *      33-63   |    3    |  79_981
 *      64-95   |    4    | 102_793
 *
 * Rounded up from 34_624 for ~15% headroom.
 */
export const HCA_PRIMARY_NAME_BASE_GAS = 40_000n

/**
 * Gas per ADDITIONAL storage word. Measured marginal cost is ~22_700 (a cold
 * SSTORE at 22_100 plus overhead); rounded up to keep the same headroom.
 */
export const HCA_PRIMARY_NAME_WORD_GAS = 25_000n

/**
 * Storage words `DefaultReverseRegistrar` writes for a name.
 *
 * Solidity packs a string of <=31 bytes into the slot itself; anything longer
 * spends the slot on the length and moves the data to `ceil(len/32)` slots at
 * `keccak(slot)`. Byte length, not character count — a UTF-8 name costs by
 * what it encodes to. The formula reproduces all six measurements above.
 */
function primaryNameStorageWords(name: string): bigint {
  const bytes = new TextEncoder().encode(name).length
  return bytes <= 31 ? 1n : 1n + BigInt(Math.ceil(bytes / 32))
}

/**
 * Extra gas the reveal batch needs to also set `primaryName`.
 *
 * Length-aware because a flat allowance is not safe: a 33-byte name needs
 * ~80k, so the flat 60k this replaced covered only names up to about 32 bytes
 * and silently leaned on the base limit's slack for anything longer.
 */
export function primaryNameGas(name: string): bigint {
  return (
    HCA_PRIMARY_NAME_BASE_GAS +
    (primaryNameStorageWords(name) - 1n) * HCA_PRIMARY_NAME_WORD_GAS
  )
}

/** What varies in the reveal batch, and therefore in what the leg costs. */
export interface RegisterLegShape {
  /**
   * Whether the HCA's `PermissionedResolver` already has code. Required, not
   * defaulted: `false` is both the common case and the expensive one, and
   * defaulting either way is what let the deploy go unpriced.
   */
  readonly isResolverDeployed: boolean
  /** The primary name the batch will set, or `undefined` when opted out. */
  readonly primaryName?: string
}

/**
 * The `register` leg's gas limit — the ONLY thing that funds the leg, since
 * `/intents/route` prices purely on `destinationGasUnits` and never inspects
 * the calls (verified live: 450k costs the same at 5 or 6 executions). So every
 * conditional call in `buildRevealBatch` must be added here or it is unfunded.
 *
 * Under-sizing strands a paid-for commitment; over-sizing only leaves spare
 * USDC in the HCA for the next registration.
 */
export function registerLegGasLimit(shape: RegisterLegShape): bigint {
  return (
    HCA_LEG_GAS_LIMITS.register +
    (shape.isResolverDeployed ? 0n : HCA_RESOLVER_DEPLOY_GAS) +
    (shape.primaryName ? primaryNameGas(shape.primaryName) : 0n)
  )
}

export type HcaLeg = keyof typeof HCA_LEG_GAS_LIMITS

/** `Math.max` for bigints (no bigint overload on `Math.max`). */
const bigintMax = (a: bigint, b: bigint): bigint => (a > b ? a : b)

/**
 * Sanity ceiling on the per-leg gas price used by the FALLBACK model, to stop
 * a transient base-fee spike from ballooning the estimate. Real same-chain
 * fills settle at ~1-2 gwei; 5 gwei is generous headroom.
 */
const FALLBACK_MAX_GAS_PRICE_WEI = 5_000_000_000n

/** Last-resort flat fallback per leg (USDC 6dp) when even the quote metadata is absent. */
const FALLBACK_LEG_FEE_6DP = 5_000_000n // 5 USDC/leg

/**
 * Minimum gas price (wei) the fee half of a leg is priced at, per chain.
 *
 * The orchestrator sizes the refund it pulls at the gas price of the block the
 * fill lands in, while the permit is signed from a quote taken minutes earlier.
 * Sepolia moves between those two points by up to ~800x (a ~19 wei base fee at
 * quote time against ~1 gwei at fill), so a quote taken at the cheap end funds
 * a fraction of what the fill pulls: one live run quoted 0.004868 USDC for both
 * legs and then had 0.171572 pulled by the commit alone, which left the account
 * under the registration price and stranded a paid-for commitment.
 *
 * Mainnet gas does not collapse like that, so this is per chain rather than
 * global: a chain without an entry prices its legs from the quote alone.
 */
const FLOOR_GAS_PRICE_WEI: Record<number, bigint> = {
  [SEPOLIA_CHAIN_ID]: 2_000_000_000n,
  [BASE_SEPOLIA_CHAIN_ID]: 2_000_000_000n,
}

/**
 * Rhinestone's refund sizing, measured off live quotes:
 *
 *     refundAmount ≈ 1.8 × (1.5M + gasOverhead) × gasPrice × ethUsd
 *
 * `gasOverhead` carries their relay fee as `fee ÷ gasPrice`, so at a fixed gas
 * price it contributes the fee itself (~$0.008) plus a ~50k base. Folding that
 * base into the 1.5M keeps the floor a function of the gas price alone, within
 * ~$0.50 of the full expression. They change these without notice, so this is a
 * floor derived from observation, never a prediction of what will be charged.
 */
const REFUND_GAS_UNITS = 1_550_000n
const REFUND_MULTIPLIER_BPS = 18_000n

/**
 * Ceiling (USDC, 6dp) on a single floored leg. `ethUsd` comes from the
 * orchestrator, so a floor derived from it must not be able to inflate the
 * permit without bound. 15 USDC covers the floor at both testnet gas floors up
 * to ~$2700/ETH, and twice it stays clear of {@link HCA_MAX_LEG_FEES_USDC}.
 */
const FLOOR_LEG_FEE_CAP_6DP = 15_000_000n

/**
 * Ceiling (USDC, 6dp) on the COMBINED execution cost of the commit + register
 * legs — the margin the orchestrator's own figures are allowed to occupy on top
 * of the registration price.
 *
 * WHY A CEILING AT ALL. `commitCost` and `registerCost` are parsed straight out
 * of an HTTP response from the orchestrator and summed into the value of an
 * EIP-2612 permit the user is then asked to sign. Without a bound, a defect or
 * compromise on that side reaches the wallet unfiltered: the response names the
 * number and we sign for it. The price half of the budget is read on-chain by
 * us, so it needs no bounding — only the fee half does.
 *
 * WHY 45 USDC. It has to clear what our OWN floor produces, since a budget the
 * floor raised must not then be refused: two legs floored at
 * {@link FLOOR_LEG_FEE_CAP_6DP} come to 30, and the remaining 15 is headroom
 * for a leg the orchestrator genuinely prices above the floor. It does not
 * have to clear the fallback model, which never reaches a permit:
 * `estimateHcaBudgetActor` refuses any breakdown whose `source` is not
 * `'quote'`.
 *
 * It remains a sanity bound on a fund-moving figure, not a budget target.
 *
 * REVISIT ON MAINNET. The manifest is testnet-only today (sepolia +
 * baseSepolia). A mainnet deployment prices legs in real gas and must re-derive
 * this from that chain's own fills rather than inherit the testnet number.
 */
export const HCA_MAX_LEG_FEES_USDC = 45_000_000n

/**
 * The largest funding budget (USDC, 6dp) this route will ever ask a wallet to
 * permit for `registrationPrice`, computed WITHOUT reference to the
 * orchestrator's figures: the price comes from our own `getRegisterPrice` read
 * and the margin is {@link HCA_MAX_LEG_FEES_USDC}.
 */
export function hcaBudgetMaximum(registrationPrice: bigint): bigint {
  return registrationPrice + HCA_MAX_LEG_FEES_USDC
}

/**
 * Drift (basis points) allowed between a USDC figure shown to the user and the
 * one a later re-quote produces for the same action.
 *
 * Checkout and the registration machine each take their own quote, up to
 * `HCA_BUDGET_STALE_TIME_MS` apart, so the two legitimately disagree whenever
 * the destination gas price moves in between. 25% of the TOTAL is a generous
 * allowance on the fee component (the price dominates the total and is read
 * on-chain), while still bounding how far above the displayed figure a permit
 * may be signed. Divergence DOWNWARD is never checked: a user shown more than
 * they are asked to approve has not been misled.
 */
const HCA_BUDGET_DRIFT_BPS = 2_500n

/** `value` widened by {@link HCA_BUDGET_DRIFT_BPS}. */
export function withBudgetDrift(value: bigint): bigint {
  return value + (value * HCA_BUDGET_DRIFT_BPS) / 10_000n
}

/**
 * The orchestrator quoted a budget above {@link hcaBudgetMaximum}.
 *
 * Thrown rather than clamped: a figure this far out means the quote is wrong or
 * the response was tampered with, and either way the safe move is to stop
 * before a signature is requested, not to sign for a capped amount.
 */
export class HcaBudgetExceedsMaximumError extends Error {
  readonly total: bigint
  readonly expectedMaximum: bigint
  readonly registrationPrice: bigint

  constructor(params: {
    total: bigint
    expectedMaximum: bigint
    registrationPrice: bigint
    commitCost: bigint
    registerCost: bigint
  }) {
    super(
      `Refusing to size a funding permit from this quote: the orchestrator ` +
        `priced the registration at ${usdc(params.total)} USDC, above the ` +
        `expected maximum of ${usdc(params.expectedMaximum)} USDC ` +
        `(on-chain price ${usdc(params.registrationPrice)} USDC + ` +
        `${usdc(HCA_MAX_LEG_FEES_USDC)} USDC of execution costs). ` +
        `Quoted legs: commit ${usdc(params.commitCost)} USDC, register ` +
        `${usdc(params.registerCost)} USDC.`,
    )
    this.name = 'HcaBudgetExceedsMaximumError'
    this.total = params.total
    this.expectedMaximum = params.expectedMaximum
    this.registrationPrice = params.registrationPrice
  }
}

/** Format a 6dp USDC amount for an error message. */
const usdc = (amount: bigint): string => formatUnits(amount, 6)

/**
 * Market data the orchestrator returns alongside a quote
 * (`intentOp.signedMetadata`). Prices are 1e8-scaled; `gasPriceWei` is the
 * destination chain's gas price.
 */
export interface QuoteMarketData {
  readonly ethUsd8: bigint
  readonly usdcUsd8: bigint
  readonly gasPriceWei: bigint
}

/**
 * One leg's quote. `spendUsdc` is the orchestrator's quoted spend
 * (`intentCost.tokensSpent`; `null` when the route could not be priced — e.g.
 * an unfunded account). `market` is present whenever the quote round-trip
 * succeeded, so the fallback model can be driven off the orchestrator's own
 * prices instead of a separate (browser-unreachable) price service.
 * `gasRefund` is the refund the intent would be signed with; see
 * {@link legFeeUsdc} for why the spend alone is not enough.
 */
export interface QuoteLegResult {
  readonly spendUsdc: bigint | null
  readonly market?: QuoteMarketData
  readonly gasRefund?: QuotedGasRefund
}

/**
 * Multiplier on the quoted gas overhead in {@link legFeeUsdc}. The overhead is
 * charged at the RELAYER's gas price, which has run 10-20% above the quoted
 * one (1.2 Mwei filled against 1.0-1.1 quoted), and its fixed part moved from
 * ~49.5k to 170k gas overnight on 2026-10-07. Doubling it covers both, and it
 * only costs anything when the overhead is large — i.e. when it is mostly the
 * relay fee (~$0.0075), so the worst case is about one relay fee per leg.
 */
export const QUOTED_GAS_OVERHEAD_HEADROOM = 2n

/** Round-up division, so a budget is never a unit short. */
const divCeil = (a: bigint, b: bigint): bigint => (a + b - 1n) / b

/**
 * The USDC (6dp) to budget for one intent's fee.
 *
 * The orchestrator's quoted spend prices the gas limit plus a fixed allowance,
 * but NOT the relay fee it charges through `gasRefund.overhead`, which it
 * encodes as `fee ÷ gas price` gas units. At ~1 gwei that overhead is ~52k gas
 * and the allowance covers it; at Sepolia's ~1 Mwei it is ~2.6M gas, and a
 * first commit pulled 0.010017 USDC against 0.007681 quoted for BOTH legs —
 * stranding the reveal 0.0023 USDC short of the price.
 *
 * The executor pulls `(measured gas + gasOverhead) × gas price × exchangeRate`,
 * and never more than the signed `refundAmount`. So the same quote also bounds
 * the pull — the leg's gas limit plus {@link QUOTED_GAS_OVERHEAD_HEADROOM}× the
 * overhead, at the quoted gas price, capped at `refundAmount` — and the larger
 * of that and the quoted spend is budgeted. At normal gas prices the spend is
 * the larger, so this changes nothing there.
 */
export function legFeeUsdc(params: {
  readonly spendUsdc: bigint
  readonly gasLimit: bigint
  readonly gasPriceWei?: bigint
  readonly gasRefund?: QuotedGasRefund
}): bigint {
  const { spendUsdc, gasLimit, gasPriceWei, gasRefund } = params
  if (
    !gasRefund ||
    !gasPriceWei ||
    isAddressEqual(gasRefund.token, zeroAddress)
  ) {
    return spendUsdc
  }
  const pullBound = divCeil(
    (gasLimit + QUOTED_GAS_OVERHEAD_HEADROOM * gasRefund.gasOverhead) *
      gasPriceWei *
      gasRefund.exchangeRate,
    10n ** 18n,
  )
  const capped =
    gasRefund.refundAmount > 0n && pullBound > gasRefund.refundAmount
      ? gasRefund.refundAmount
      : pullBound
  return capped > spendUsdc ? capped : spendUsdc
}

/**
 * Quote one leg from Rhinestone. Returns `null` when no quote could be made at
 * all. Injected by the caller (which owns the SDK account + session context).
 *
 * `incomingUsdc` is declared to the planner as auxiliary funds: the HCA is
 * funded from the owner's permit INSIDE the commit, so at quote time it does
 * not yet hold what the legs will spend. Without it the planner refuses to
 * price either leg and every budget silently falls back to the gas model.
 */
export type QuoteLegCostUsdc = (
  leg: HcaLeg,
  incomingUsdc?: bigint,
) => Promise<QuoteLegResult | null>

/** Fallback: convert a gas LIMIT to a USDC (6dp) cost at a clamped gas price. */
function fallbackLegFee6dp(
  limit: bigint,
  gasPrice: bigint,
  prices: { eth: bigint; usdc: bigint },
): bigint {
  const clamped =
    gasPrice > FALLBACK_MAX_GAS_PRICE_WEI
      ? FALLBACK_MAX_GAS_PRICE_WEI
      : gasPrice
  const wei = limit * clamped
  // wei (1e18) × ethUsd8 / usdcUsd8 → USDC at 1e18 scale; ÷1e12 → 6dp units.
  return (wei * prices.eth) / (prices.usdc * 10n ** 12n)
}

/**
 * The least a leg may be funded for on this chain: what the orchestrator would
 * pull if the fill landed at {@link FLOOR_GAS_PRICE_WEI}. Zero when the chain
 * has no floor, or when no quote carried the market data to price one.
 *
 * Clamped to {@link FLOOR_LEG_FEE_CAP_6DP}: `ethUsd` comes from the
 * orchestrator, and a floor derived from it must not be able to inflate the
 * permit without bound.
 */
function refundFloor6dp(
  chainId: number,
  market: QuoteMarketData | undefined,
): bigint {
  const floorGasPrice = FLOOR_GAS_PRICE_WEI[chainId]
  if (floorGasPrice === undefined || !market) return 0n
  const wei =
    (REFUND_MULTIPLIER_BPS * REFUND_GAS_UNITS * floorGasPrice) / 10_000n
  const usdc = (wei * market.ethUsd8) / (market.usdcUsd8 * 10n ** 12n)
  return usdc > FLOOR_LEG_FEE_CAP_6DP ? FLOOR_LEG_FEE_CAP_6DP : usdc
}

/**
 * What a leg is funded for: its quote, or the gas model when it could not be
 * quoted, never less than the chain's floor. One of the first two is always
 * present, by construction of the fallback above.
 */
function legCost(
  quoted: bigint | null,
  fallback: bigint | undefined,
  floor: bigint,
): bigint {
  return bigintMax(quoted ?? (fallback as bigint), floor)
}

export interface HcaBudgetParams {
  readonly publicClient: PublicClient
  readonly chainId: number
  /** Registration label (no `.eth`). */
  readonly label: string
  /** Registration duration (seconds) — same value used at commit + reveal. */
  readonly duration: bigint
  /**
   * Optional per-leg Rhinestone quote. When it returns a spend amount, that is
   * used directly; when it only returns market data, the gas-limit model is
   * priced from it; when it returns nothing, a flat per-leg fee is used.
   */
  readonly quoteLegCostUsdc?: QuoteLegCostUsdc
  /**
   * The HCA's current USDC balance (6dp), if known.
   *
   * Used only to size the auxiliary-funds declaration sent with the quotes:
   * whatever the HCA already holds does not need declaring, and declaring it
   * would double-count against the planner's own view. Omitting it is safe but
   * over-declares by the current balance.
   */
  readonly hcaBalanceUsdc?: bigint
  /**
   * The primary name the reveal batch will set, when the user opted in.
   * Widens the `register` leg's gas limit by `primaryNameGas(name)` so the
   * permit covers the batch that actually fills. The NAME, not a boolean:
   * the cost scales with its storage words.
   */
  readonly primaryName?: string
  /**
   * See {@link RegisterLegShape}. Must be the same value the caller hands
   * `buildRevealBatch`, so the budget and the batch cannot disagree.
   */
  readonly isResolverDeployed: boolean
  /**
   * See {@link CommitLegShape}. Whether the HCA has code; `false` makes the
   * first commit deploy it inside the same batch.
   */
  readonly isHcaDeployed: boolean
}

export interface HcaBudgetBreakdown {
  /** Total USDC (6dp) to permit + transfer into the HCA. */
  readonly total: bigint
  readonly commitCost: bigint
  readonly registerCost: bigint
  readonly registrationPrice: bigint
  /**
   * The independent ceiling {@link total} was checked against — on-chain price
   * plus {@link HCA_MAX_LEG_FEES_USDC}, derived without the orchestrator's
   * figures. Carried on the breakdown so the permit can be bounded by the same
   * number the estimate was accepted under, rather than re-deriving it from a
   * price read a second time.
   */
  readonly expectedMaximum: bigint
  /** Which source produced the leg costs. */
  readonly source: 'quote' | 'fallback' | 'mixed'
  /**
   * Why any leg fell back. Present only when `source` is not `'quote'`.
   * A fallback silently over-funds, so the reason must be visible.
   */
  readonly fallbackReasons?: readonly string[]
}

/**
 * Compute the same-chain HCA funding budget at runtime:
 * `commitCost + registerCost + registrationPrice`.
 *
 * Prefers Rhinestone's per-leg quote; falls back to a clamped gas-limit model
 * per leg when the quote is unavailable.
 */
export async function estimateHcaBudget(
  params: HcaBudgetParams,
): Promise<HcaBudgetBreakdown> {
  getDestinationContracts(params.chainId) // validate the chain is supported

  const registrationPrice = await readRegisterPrice({
    publicClient: params.publicClient,
    chainId: params.chainId,
    label: params.label,
    duration: params.duration,
  })

  // First-pass estimate of what the funding permit will pull in, declared to
  // the planner as auxiliary funds so it will price the legs at all.
  //
  // Chicken-and-egg: the exact inflow is `total - balance`, but `total` is what
  // these quotes produce. So declare the most this route could ever fund, the
  // same ceiling the finished budget is checked against. Under-declaring is
  // the dangerous direction: the planner refuses to price an account it sees
  // as below the fee, which leaves the budget unquotable and the registration
  // refused rather than merely mis-sized. The permit itself is sized from the
  // FINAL budget, not from this.
  const balance = params.hcaBalanceUsdc ?? 0n
  const declaredInflow = bigintMax(
    hcaBudgetMaximum(registrationPrice) - balance,
    0n,
  )

  // What each batch will contain, and so what the legs must be funded for.
  const commitGasLimit = commitLegGasLimit({
    isHcaDeployed: params.isHcaDeployed,
  })
  const registerGasLimit = registerLegGasLimit({
    isResolverDeployed: params.isResolverDeployed,
    ...(params.primaryName ? { primaryName: params.primaryName } : {}),
  })

  // Best-effort quote per leg.
  const quotedCommit = await tryQuote(
    params.quoteLegCostUsdc,
    'commit',
    declaredInflow,
  )
  // The reveal runs after the commit has funded the HCA, but at quote time that
  // has not happened yet — declare the same inflow or it cannot be priced.
  const quotedRegister = await tryQuote(
    params.quoteLegCostUsdc,
    'register',
    declaredInflow,
  )

  const fallbackReasons = [quotedCommit.reason, quotedRegister.reason].filter(
    (r): r is string => r !== undefined,
  )

  // Gas-limit fallback, priced off the quote's OWN market data. Either leg's
  // quote carries it, so an unpriced route (e.g. an unfunded HCA, which cannot
  // yield a spend amount) still gets a realistic estimate rather than a flat fee.
  let fallbackCommit: bigint | undefined
  let fallbackRegister: bigint | undefined
  if (quotedCommit.value === null || quotedRegister.value === null) {
    const market = quotedCommit.market ?? quotedRegister.market
    if (!market) {
      fallbackReasons.push('no quote market data (flat per-leg fee used)')
    }
    const prices = market
      ? { eth: market.ethUsd8, usdc: market.usdcUsd8 }
      : undefined
    fallbackCommit =
      prices && market
        ? fallbackLegFee6dp(commitGasLimit, market.gasPriceWei, prices)
        : FALLBACK_LEG_FEE_6DP
    fallbackRegister =
      prices && market
        ? fallbackLegFee6dp(registerGasLimit, market.gasPriceWei, prices)
        : FALLBACK_LEG_FEE_6DP
  }

  // Two bounds on what a leg may be funded for, covering opposite ends of the
  // gas range. `legFeeUsdc` tracks the refund the orchestrator could pull at
  // the gas price it quoted at; the floor covers the case that quote cannot,
  // a price so low the fill will not land anywhere near it.
  const floor = refundFloor6dp(
    params.chainId,
    quotedCommit.market ?? quotedRegister.market,
  )
  const quotedCommitFee =
    quotedCommit.value === null
      ? null
      : legFeeUsdc({
          spendUsdc: quotedCommit.value,
          gasLimit: commitGasLimit,
          gasPriceWei: quotedCommit.market?.gasPriceWei,
          gasRefund: quotedCommit.gasRefund,
        })
  const quotedRegisterFee =
    quotedRegister.value === null
      ? null
      : legFeeUsdc({
          spendUsdc: quotedRegister.value,
          gasLimit: registerGasLimit,
          gasPriceWei: quotedRegister.market?.gasPriceWei,
          gasRefund: quotedRegister.gasRefund,
        })
  const commitCost = legCost(quotedCommitFee, fallbackCommit, floor)
  const registerCost = legCost(quotedRegisterFee, fallbackRegister, floor)

  // No percentage buffer: each leg is priced from a gas limit already derived
  // from the batch that will be submitted. A multiplier on a limit that misses
  // a call still misses the call — the fix is to add it to the limit. It also
  // only ever papered over failed quotes, which `source` surfaces instead.
  const total = commitCost + registerCost + registrationPrice

  // Bound the figures that came from the orchestrator against one we derived
  // ourselves. `registrationPrice` is our own on-chain read, so the only
  // externally-supplied part of `total` is the leg costs — and this is the last
  // point before that sum becomes the value of a permit the user signs.
  const expectedMaximum = assertBudgetWithinMaximum({
    total,
    registrationPrice,
    commitCost,
    registerCost,
  })

  const source: HcaBudgetBreakdown['source'] =
    quotedCommit.value !== null && quotedRegister.value !== null
      ? 'quote'
      : quotedCommit.value === null && quotedRegister.value === null
        ? 'fallback'
        : 'mixed'

  return {
    total,
    commitCost,
    registerCost,
    registrationPrice,
    expectedMaximum,
    source,
    ...(fallbackReasons.length > 0 ? { fallbackReasons } : {}),
  }
}

/**
 * Check a quoted budget against {@link hcaBudgetMaximum} and return the ceiling
 * it passed, so callers can carry it forward to bound the permit itself.
 *
 * Throws rather than returning a flag: there is no sensible way to continue
 * with a budget this code does not believe, and the whole point is that no
 * signature is requested.
 */
function assertBudgetWithinMaximum(params: {
  total: bigint
  registrationPrice: bigint
  commitCost: bigint
  registerCost: bigint
}): bigint {
  const expectedMaximum = hcaBudgetMaximum(params.registrationPrice)
  if (params.total > expectedMaximum) {
    throw new HcaBudgetExceedsMaximumError({ ...params, expectedMaximum })
  }
  return expectedMaximum
}

/**
 * A quote can be unavailable for three very different reasons, all of which
 * previously collapsed into a silent `null` and an unexplained `fallback`
 * source. Report which one happened so an over-funded budget is diagnosable.
 */
async function tryQuote(
  quoter: QuoteLegCostUsdc | undefined,
  leg: HcaLeg,
  incomingUsdc?: bigint,
): Promise<{
  value: bigint | null
  market?: QuoteMarketData
  gasRefund?: QuotedGasRefund
  reason?: string
}> {
  if (!quoter) return { value: null, reason: `${leg}: no quoter available` }
  try {
    const result = await quoter(leg, incomingUsdc)
    if (result === null) return { value: null, reason: `${leg}: no quote` }
    const market = result.market ? { market: result.market } : {}
    return result.spendUsdc === null
      ? {
          value: null,
          ...market,
          reason: `${leg}: quote returned no spend amount`,
        }
      : {
          value: result.spendUsdc,
          ...market,
          ...(result.gasRefund ? { gasRefund: result.gasRefund } : {}),
        }
  } catch (error) {
    return {
      value: null,
      reason: `${leg}: quote threw — ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
