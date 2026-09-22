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
 *            + 3% buffer of registerLegCost  (gas-spike headroom in the ~60s
 *                                             commit→reveal cooldown)
 *            + registrationPrice       (the .eth rent, USDC)
 *
 * PREFERRED sizing (`quoteLegCostUsdc`): each leg's USDC cost comes straight
 * from Rhinestone's own quote — `account.prepareTransaction(...)` returns
 * `intentRoute.intentOp.elements[0].spendTokens`, the exact USDC the
 * orchestrator will pull for that intent. This is immune to the caller's local
 * gas-price reads (Sepolia `getGasPrice()` spikes to ~20 gwei even when the
 * tx settles at ~1-2 gwei, which massively over-sizes a gas×price model).
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
import { formatUnits } from 'viem'
import { getDestinationContracts } from './manifest'
import { readRegisterPrice } from './registration-calls'

/**
 * Per-leg gas LIMITS. Passed to `prepareTransaction({ gasLimit })` so the
 * orchestrator quotes against a bounded leg, and used by the fallback model.
 * Sized from live Sepolia fills (register ≈ 393k gas measured) plus headroom.
 */
export const HCA_LEG_GAS_LIMITS = {
  // Proven upper bound: a first-use commit (enable + permit + transferFrom +
  // commit, which deploys the HCA) filled at ~393k gas on live Sepolia. The
  // rail prices the quote on this LIMIT, so it must cover the full bundle or a
  // successful quote could underfund the HCA and revert the first commit.
  commit: 450_000n,
  register: 450_000n,
} as const

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

/**
 * The `register` leg's gas limit, widened when the batch sets a primary name.
 *
 * This bump is what actually funds the extra call. Verified against the live
 * orchestrator: `/intents/route` prices purely on `destinationGasUnits` — the
 * same request at 450k costs an identical 3277666 (6dp) whether the batch
 * carries 5 executions or 6, while 450k → 510k moves it to ~3539296. So the
 * quote never sees the call; it only ever sees this number. An under-sized
 * limit under-funds the permit and the fill then fails for insufficient USDC.
 * Over-sizing only leaves spare USDC in the HCA, which the next registration
 * reuses.
 */
export function registerLegGasLimit(primaryName?: string): bigint {
  return (
    HCA_LEG_GAS_LIMITS.register +
    (primaryName ? primaryNameGas(primaryName) : 0n)
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
 * WHY 25 USDC. Live Sepolia fills price the commit leg at ~0.9 USDC and the
 * 450k-gas register leg at ~3.3 USDC, so a healthy route uses ~4.2 of this. The
 * bound is set at roughly 6x that, which is also just above what the clamped
 * fallback model can produce at its own 5 gwei cap (~950k gas × 5 gwei ≈ 0.0048
 * ETH, ~19 USDC at $4000/ETH) — so a legitimate gas regime, even a spiky one,
 * never trips it. It is a sanity bound on a fund-moving figure, not a budget
 * target.
 *
 * REVISIT ON MAINNET. The manifest is testnet-only today (sepolia +
 * baseSepolia). A mainnet deployment prices legs in real gas and must re-derive
 * this from that chain's own fills rather than inherit the testnet number.
 */
export const HCA_MAX_LEG_FEES_USDC = 25_000_000n

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
 * One leg's quote. `spendUsdc` is the exact USDC the orchestrator will pull
 * (`null` when the route could not be priced — e.g. an unfunded account).
 * `market` is present whenever the quote round-trip succeeded, so the fallback
 * model can be driven off the orchestrator's own prices instead of a separate
 * (browser-unreachable) price service.
 */
export interface QuoteLegResult {
  readonly spendUsdc: bigint | null
  readonly market?: QuoteMarketData
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
  // these quotes produce. The price dominates the total and is already known
  // exactly, so price + the flat per-leg fallbacks is a close upper-ish bound —
  // and it only has to be good enough for the planner to see the HCA covered.
  // The permit itself is sized from the FINAL budget, not from this.
  const balance = params.hcaBalanceUsdc ?? 0n
  const declaredInflow = bigintMax(
    registrationPrice + FALLBACK_LEG_FEE_6DP * 2n - balance,
    0n,
  )

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
        ? fallbackLegFee6dp(
            HCA_LEG_GAS_LIMITS.commit,
            market.gasPriceWei,
            prices,
          )
        : FALLBACK_LEG_FEE_6DP
    fallbackRegister =
      prices && market
        ? fallbackLegFee6dp(
            registerLegGasLimit(params.primaryName),
            market.gasPriceWei,
            prices,
          )
        : FALLBACK_LEG_FEE_6DP
  }

  const commitCost = quotedCommit.value ?? (fallbackCommit as bigint)
  const registerCost = quotedRegister.value ?? (fallbackRegister as bigint)

  // No percentage buffer: both quotes price the REAL batches — HCA deploy via
  // the SDK's setup ops, commit, the conditional resolver `deployProxy`,
  // `authorizeNameRoles`, and register — so every cost component is already
  // summed here rather than approximated. A buffer on top only papered over
  // quotes that failed, which is now surfaced instead (see `source`).
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
      : { value: result.spendUsdc, ...market }
  } catch (error) {
    return {
      value: null,
      reason: `${leg}: quote threw — ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
