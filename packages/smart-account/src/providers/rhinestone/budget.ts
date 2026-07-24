/**
 * Runtime same-chain HCA funding-budget estimator.
 *
 * The wallet pre-funds the HCA (one EIP-2612 permit → `transferFrom`) with
 * enough USDC to cover the whole same-chain registration paid from the HCA's
 * own balance:
 *
 *     budget = commitGasFee            (commit leg executor refund, USDC)
 *            + registerGasFee          (register leg executor refund, USDC)
 *            + 3% buffer of registerGasFee   (gas-spike headroom in the ~60s
 *                                             commit→reveal cooldown)
 *            + registrationPrice       (the .eth rent, USDC)
 *
 * The gas legs are priced the way the Rhinestone rail actually bills — the
 * executor is reimbursed in USDC for each intent it fills, at
 * `gasLimit × gasPrice × (ETH/USD ÷ USDC/USD)`, NOT the raw chain gas. This
 * mirrors the calibrated crossmint fulfilment quote
 * (`workers/api-worker/.../crossmint/intent-quote.ts`): per-leg gas LIMITS
 * (the rail prices on the limit, not usage) converted through Rhinestone's own
 * price service.
 *
 * This is NOT the session refund CAP (`MAX_REFUND_AMOUNT`, baked into the
 * session salt) — that is a fixed ceiling. This is the actual USDC moved into
 * the HCA up front, sized to the live quote so the wallet neither under-funds
 * (intent reverts / register strands) nor over-funds.
 */

import type { PublicClient } from 'viem'
import { getDestinationContracts } from './manifest'
import { readRegisterPrice } from './registration-calls'

/**
 * Per-leg gas LIMITS the same-chain HCA flow prices on. The Rhinestone rail
 * reimburses the executor over the limit supplied, so these are the tightest
 * limits that safely cover each leg's measured usage (mirrors crossmint's
 * `LEG_GAS_LIMITS`, adjusted for the HCA batch shape):
 *
 *   - commit: enable-session + permit + transferFrom + commit, in one intent.
 *     Measured HCA commit fill ≈ 116k gas (fork trace); rounded up for the
 *     funding pair + first-use enable envelope overhead.
 *   - register: approve + register (+ optional resolver deploy / setters /
 *     primary). Register alone is ~337k stable ±0.2% across names; headroom
 *     for a cold-slot resolver deploy on first use.
 */
export const HCA_LEG_GAS_LIMITS = {
  commit: 250_000n,
  register: 500_000n,
} as const

/** p95 gas-price drift over the ~60s commit→reveal window, applied per leg. */
const GAS_DRIFT_BUFFER_PERCENT = 3n

/** Rhinestone price service (ETH/USDC unit prices, 1e8-scaled). */
const PRICE_SERVICE_URL =
  'https://v1.orchestrator.rhinestone.dev/deposit-processor/prices'

/** Shared dev key (already committed in apps/manager/.env.ci). Overridable. */
const DEFAULT_RHINESTONE_API_KEY =
  'rs_2fcz8PTz5A0vf1Z1HIG19qHxTd_NtCCJmRavTxtNL8'

/** Conservative fallback budget (USDC 6dp) if the quote can't be computed. */
const FALLBACK_GAS_FEE_6DP = 40_000_000n // 40 USDC of gas headroom

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

/**
 * Convert a gas LIMIT to a USDC (6dp) executor refund at the current gas price
 * and ETH/USDC rate, with an optional upward gas-price drift buffer.
 */
function gasLegFee6dp(
  limit: bigint,
  gasPrice: bigint,
  prices: { eth: bigint; usdc: bigint },
  driftPercent = 0n,
): bigint {
  const bufferedWei = (limit * gasPrice * (100n + driftPercent)) / 100n
  // wei (1e18) × ethUsd8 / usdcUsd8 → USDC at 1e18 scale; ÷1e12 → 6dp units.
  return (bufferedWei * prices.eth) / (prices.usdc * 10n ** 12n)
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
}

export interface HcaBudgetBreakdown {
  /** Total USDC (6dp) to permit + transfer into the HCA. */
  readonly total: bigint
  readonly commitGasFee: bigint
  readonly registerGasFee: bigint
  readonly registerGasBuffer: bigint
  readonly registrationPrice: bigint
}

/**
 * Compute the same-chain HCA funding budget at runtime:
 * `commitGasFee + registerGasFee + 3%·registerGasFee + registrationPrice`.
 *
 * Reads the live registration price and (best-effort) the live gas price +
 * ETH/USDC rate. Falls back to a conservative flat gas fee if the price feed
 * or gas price is unreachable, so a quote outage never under-funds the HCA.
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

  let commitGasFee: bigint
  let registerGasFee: bigint
  try {
    const [gasPrice, prices] = await Promise.all([
      params.publicClient.getGasPrice(),
      fetchUsdPrices8(params.apiKey ?? DEFAULT_RHINESTONE_API_KEY),
    ])
    commitGasFee = gasLegFee6dp(
      HCA_LEG_GAS_LIMITS.commit,
      gasPrice,
      prices,
      GAS_DRIFT_BUFFER_PERCENT,
    )
    registerGasFee = gasLegFee6dp(
      HCA_LEG_GAS_LIMITS.register,
      gasPrice,
      prices,
      GAS_DRIFT_BUFFER_PERCENT,
    )
  } catch {
    // Split the flat fallback across the two legs proportionally to their
    // limits so the buffer/formula shape below still holds.
    const totalLimit = HCA_LEG_GAS_LIMITS.commit + HCA_LEG_GAS_LIMITS.register
    commitGasFee =
      (FALLBACK_GAS_FEE_6DP * HCA_LEG_GAS_LIMITS.commit) / totalLimit
    registerGasFee =
      (FALLBACK_GAS_FEE_6DP * HCA_LEG_GAS_LIMITS.register) / totalLimit
  }

  // 3% buffer on the register leg's gas fee only (per the funding formula).
  const registerGasBuffer = (registerGasFee * 3n) / 100n

  const total =
    commitGasFee + registerGasFee + registerGasBuffer + registrationPrice

  return {
    total,
    commitGasFee,
    registerGasFee,
    registerGasBuffer,
    registrationPrice,
  }
}
