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
 * LIMIT × live gas price × ETH/USDC, mirroring the calibrated crossmint
 * fulfilment quote — but this is a rough upper bound and is only used when the
 * orchestrator quote is unavailable.
 *
 * This is NOT the session refund CAP (`MAX_REFUND_AMOUNT`, baked into the
 * session salt) — that is a fixed ceiling. This is the actual USDC moved into
 * the HCA up front.
 */

import type { PublicClient } from 'viem'
import { getDestinationContracts } from './manifest'
import { readRegisterPrice } from './registration-calls'

/**
 * Per-leg gas LIMITS. Passed to `prepareTransaction({ gasLimit })` so the
 * orchestrator quotes against a bounded leg, and used by the fallback model.
 * Sized from live Sepolia fills (register ≈ 393k gas measured) plus headroom.
 */
export const HCA_LEG_GAS_LIMITS = {
  commit: 200_000n,
  register: 450_000n,
} as const

export type HcaLeg = keyof typeof HCA_LEG_GAS_LIMITS

/** p95 gas-price drift over the ~60s commit→reveal window, register leg only. */
const REGISTER_BUFFER_PERCENT = 3n

/** Rhinestone price service (ETH/USDC unit prices, 1e8-scaled). */
const PRICE_SERVICE_URL =
  'https://v1.orchestrator.rhinestone.dev/deposit-processor/prices'

/** Shared dev key (already committed in apps/manager/.env.ci). Overridable. */
const DEFAULT_RHINESTONE_API_KEY =
  'rs_2fcz8PTz5A0vf1Z1HIG19qHxTd_NtCCJmRavTxtNL8'

/**
 * Sanity ceiling on the per-leg gas price used by the FALLBACK model, to stop
 * a transient Sepolia base-fee spike from ballooning the estimate. Real
 * same-chain fills settle at ~1-2 gwei; 5 gwei is generous headroom.
 */
const FALLBACK_MAX_GAS_PRICE_WEI = 5_000_000_000n

/** Conservative flat fallback per leg (USDC 6dp) if the price feed is down. */
const FALLBACK_LEG_FEE_6DP = 5_000_000n // 5 USDC/leg

/**
 * Quote one leg's USDC (6dp) cost from Rhinestone. Returns `null` when the
 * quote is unavailable so the caller can fall back to the gas-limit model.
 * Injected by the caller (which owns the SDK account + session context).
 */
export type QuoteLegCostUsdc = (leg: HcaLeg) => Promise<bigint | null>

/** USD unit prices (1e8-scaled) from Rhinestone's price service. */
async function fetchUsdPrices8(
  apiKey: string,
): Promise<{ eth: bigint; usdc: bigint }> {
  const res = await fetch(`${PRICE_SERVICE_URL}?symbols=ETH,USDC`, {
    headers: { 'x-api-key': apiKey },
  })
  if (!res.ok) throw new Error(`price service ${res.status}`)
  const body = (await res.json()) as { prices?: Record<string, number> }
  const eth = body.prices?.ETH
  const usdc = body.prices?.USDC
  if (!eth || eth <= 0 || !usdc || usdc <= 0) {
    throw new Error('price service returned no ETH/USDC price')
  }
  return {
    eth: BigInt(Math.round(eth * 1e8)),
    usdc: BigInt(Math.round(usdc * 1e8)),
  }
}

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
  /** Rhinestone API key for the price service. Falls back to the shared dev key. */
  readonly apiKey?: string
  /**
   * Optional per-leg Rhinestone quote. When provided and it returns a value,
   * the leg's USDC cost is taken from the orchestrator quote; otherwise the
   * gas-limit fallback model is used for that leg.
   */
  readonly quoteLegCostUsdc?: QuoteLegCostUsdc
}

export interface HcaBudgetBreakdown {
  /** Total USDC (6dp) to permit + transfer into the HCA. */
  readonly total: bigint
  readonly commitCost: bigint
  readonly registerCost: bigint
  readonly registerBuffer: bigint
  readonly registrationPrice: bigint
  /** Which source produced the leg costs. */
  readonly source: 'quote' | 'fallback' | 'mixed'
}

/**
 * Compute the same-chain HCA funding budget at runtime:
 * `commitCost + registerCost + 3%·registerCost + registrationPrice`.
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

  // Best-effort quote per leg.
  const quotedCommit = await tryQuote(params.quoteLegCostUsdc, 'commit')
  const quotedRegister = await tryQuote(params.quoteLegCostUsdc, 'register')

  // Gas-limit fallback inputs (only read if a leg is unquoted).
  let fallbackCommit: bigint | undefined
  let fallbackRegister: bigint | undefined
  if (quotedCommit === null || quotedRegister === null) {
    let gasPrice = 0n
    let prices: { eth: bigint; usdc: bigint } | null = null
    try {
      ;[gasPrice, prices] = await Promise.all([
        params.publicClient.getGasPrice(),
        fetchUsdPrices8(params.apiKey ?? DEFAULT_RHINESTONE_API_KEY),
      ])
    } catch {
      prices = null
    }
    fallbackCommit = prices
      ? fallbackLegFee6dp(HCA_LEG_GAS_LIMITS.commit, gasPrice, prices)
      : FALLBACK_LEG_FEE_6DP
    fallbackRegister = prices
      ? fallbackLegFee6dp(HCA_LEG_GAS_LIMITS.register, gasPrice, prices)
      : FALLBACK_LEG_FEE_6DP
  }

  const commitCost = quotedCommit ?? (fallbackCommit as bigint)
  const registerCost = quotedRegister ?? (fallbackRegister as bigint)

  const registerBuffer = (registerCost * REGISTER_BUFFER_PERCENT) / 100n
  const total = commitCost + registerCost + registerBuffer + registrationPrice

  const source: HcaBudgetBreakdown['source'] =
    quotedCommit !== null && quotedRegister !== null
      ? 'quote'
      : quotedCommit === null && quotedRegister === null
        ? 'fallback'
        : 'mixed'

  return {
    total,
    commitCost,
    registerCost,
    registerBuffer,
    registrationPrice,
    source,
  }
}

async function tryQuote(
  quoter: QuoteLegCostUsdc | undefined,
  leg: HcaLeg,
): Promise<bigint | null> {
  if (!quoter) return null
  try {
    return await quoter(leg)
  } catch {
    return null
  }
}
