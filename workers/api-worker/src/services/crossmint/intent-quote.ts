import { createPublicClient, http } from 'viem'
import { SEPOLIA_RPC_URL, sepoliaWithEns } from '#core/eth/client.js'
import { logger } from '#utils/logger.js'

/**
 * Order-time fulfilment gas fee, in the payment stable (6dp).
 *
 * Fulfilment runs on the INTENTS transport: each of the three legs (resolver
 * deploy, commit, register) is a separate Rhinestone Warp intent, and the
 * executor pays the SOLVER'S price for each — not the raw chain gas. So the
 * buyer's gasFee must equal what the rail actually bills, or the executor
 * (funded only by this fee at mint) bleeds and every order eventually fails
 * the funding precheck. The fee is therefore modelled on the rail's own
 * pricing shape:
 *
 *     fee = Σ_legs ( raw_gas_leg × gasPrice × drift × ETH/USD × PREMIUM
 *                    + FIXED_PER_LEG )
 *
 * i.e. raw chain gas, marked up by the solver premium, plus a fixed fee per
 * intent. Collecting exactly this makes the executor self-funding per order:
 * the gasFee deposited at mint covers that order's own three intent fills.
 *
 * PREMIUM — calibrated to the ACTUAL on-chain cost of a full intents
 * fulfilment, not the probe's prose. demonslayer.eth's three legs
 * (deploy+commit+register) filled via relayer for a MEASURED 4.39 USDC
 * (executor USDC 7.00 → 2.61 across its fulfilment). Against the raw 3-leg
 * gas base (~2.7 USDC at the time), that's an effective ~1.6× — the solver
 * premium plus fixed fees, rolled into one multiplier. We set 1.8× for a
 * small safety margin (fee ≈ raw × 1.8 ≈ 4.8, just above the measured 4.4),
 * and NO separate fixed fee (it double-counted and bloated the quote to ~9).
 * Env-overridable to retune (or swap to a live orchestrator /quotes call)
 * without a redeploy when mainnet pricing is characterised.
 *
 * LEG UNITS — live Sepolia receipts through the Zodiac Roles modifier:
 *   resolver deploy 268,000 (initialize-as-factory + setAddr + grant/revoke
 *   record bundle, eth_call-measured) + commit 84,823 + register 336,856.
 *   Kept per-leg (not summed) because the rail prices per intent, and the
 *   fixed fee applies once per leg.
 *
 * DRIFT ×1.30 — p95 upward base-fee drift over the ≤10min quote→execution
 * window (measured over 13.7h/4096 Sepolia blocks: 3min ×1.19, 5min ×1.22,
 * 10min ×1.33 at p95). The p99+ spam-spike tail is handled operationally by
 * the queue's retry/backoff, not buffered.
 *
 * ETH/USD — Rhinestone's price service (endorsed source; no Chainlink). Dev
 * key ships in-repo, inlined as an overridable default.
 */
const FULFILMENT_LEG_UNITS = [268_000n, 84_823n, 336_856n] as const

/** ×1.30 — p95 upward base-fee drift over a ≤10min window (see header). */
const GAS_DRIFT_BUFFER_PERCENT = 30n

/** Solver premium (incl. fixed fees) on raw gas, ×100 (180 = 1.8×).
 * Env-overridable. Calibrated to demonslayer's measured 4.39 USDC fill. */
const RAIL_PREMIUM_PERCENT_DEFAULT = 180n

/** Conservative fallback (USDC 6dp) when gas price or ETH/USD can't be read.
 * Covers a full 3-leg intent fulfilment (~4.4 measured, headroom for spikes)
 * so a fee-quote outage never under-collects and strands the executor. */
const FALLBACK_FEE_UNITS_6DP = 7_000_000n

const PRICE_SERVICE_URL =
  'https://v1.orchestrator.rhinestone.dev/deposit-processor/prices'
/** Shared dev key, already committed in apps/manager/.env.ci. */
const DEFAULT_RHINESTONE_API_KEY =
  'rs_2fcz8PTz5A0vf1Z1HIG19qHxTd_NtCCJmRavTxtNL8'

/** USD unit prices (1e8-scaled bigints) from Rhinestone's price service. */
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
 * Compute the fulfilment gas fee in payment-token units (6dp). Falls back to
 * a conservative flat fee (with a warning log) if the chain gas price or the
 * price service is unreachable — checkout must not depend on either.
 */
export async function quoteFulfilmentFee(
  env: CloudflareBindings,
): Promise<bigint> {
  try {
    const client = createPublicClient({
      chain: sepoliaWithEns,
      transport: http(SEPOLIA_RPC_URL),
    })
    const [gasPrice, prices] = await Promise.all([
      client.getGasPrice(),
      fetchUsdPrices8(env.RHINESTONE_API_KEY ?? DEFAULT_RHINESTONE_API_KEY),
    ])

    const premiumPct = env.RAIL_PREMIUM_PERCENT
      ? BigInt(env.RAIL_PREMIUM_PERCENT)
      : RAIL_PREMIUM_PERCENT_DEFAULT

    // Total raw chain gas across the three legs, drift-buffered (wei).
    const totalUnits = FULFILMENT_LEG_UNITS.reduce((a, u) => a + u, 0n)
    const bufferedWei =
      (totalUnits * gasPrice * (100n + GAS_DRIFT_BUFFER_PERCENT)) / 100n

    // wei (1e18) × ethUsd8 / usdcUsd8 → USDC at 1e18 scale; ÷1e12 → 6dp units.
    const rawGasFee6dp = (bufferedWei * prices.eth) / (prices.usdc * 10n ** 12n)

    // Rail price = raw gas × the solver premium (which folds in the rail's
    // fixed fees). This is what the executor actually pays the rail — what
    // the buyer must fund — making the executor self-financing per order.
    const fee = (rawGasFee6dp * premiumPct) / 100n

    if (fee === 0n) {
      logger.warn('Fulfilment fee computed as zero, using fallback')
      return FALLBACK_FEE_UNITS_6DP
    }
    return fee
  } catch (error) {
    logger.warn('Fulfilment fee quote failed, using fallback', { error })
    return FALLBACK_FEE_UNITS_6DP
  }
}
