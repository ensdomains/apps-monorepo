import { createPublicClient, http } from 'viem'
import { SEPOLIA_RPC_URL, sepoliaWithEns } from '#core/eth/client.js'
import { logger } from '#utils/logger.js'

/**
 * Order-time fulfilment gas fee, in the payment stable (6dp):
 *
 *     fee = UNITS × live gas price × p95 drift buffer × ETH/USD
 *
 * The buyer pays ACTUAL gas economics — measured units at the live chain gas
 * price with an empirically-derived buffer — not a solver rail's padded
 * pricing. (The orchestrator's own quotes embed ~3.3× gas-price padding plus
 * ~$1 fixed per intent on testnet; if the execution transport ends up costing
 * more than this fee collects, that delta is a transport decision to make
 * with data, not a cost to silently pass to every buyer.)
 *
 * UNITS — live Sepolia receipts through the Zodiac Roles modifier:
 *   resolver deploy 217,915 + commit 84,823 + register 336,856 = 639,594.
 *   The deploy leg now bundles the buyer's ETH record into the resolver init
 *   (initialize-as-factory + setAddr + grant/revoke — see
 *   buildResolverInitBundle): measured via eth_call estimate, the bundle adds
 *   87,057 over plain init → 726,651 total, plus 5% calldata-variance
 *   margin → 763k.
 *
 * BUFFER — measured base-fee drift over 13.7h of Sepolia (4096 blocks),
 * max upward drift within sliding windows:
 *   window   p50     p95     p99     max
 *    3min   ×1.067  ×1.194  ×1.768  ×4.9
 *    5min   ×1.078  ×1.216  ×2.741  ×12.5
 *   10min   ×1.093  ×1.327  ×10.1   ×42.4
 * ×1.30 covers p95 of the realistic quote→execution window (≤10min). The
 * p99+ tail (spam spikes compounding 12.5%/block) is NOT bufferable at sane
 * cost — it is handled operationally: the fulfilment queue's retry/backoff
 * waits spikes out, and the commitment validity window is hours.
 *
 * ETH/USD — Rhinestone's price service (the endorsed price source; no
 * Chainlink). The dev API key ships in-repo (apps/manager/.env.ci), so it is
 * inlined as an overridable default like the other publishable keys.
 */
const FULFILMENT_GAS_UNITS = 763_000n

/** ×1.30 — p95 upward base-fee drift over a ≤10min window (see header). */
const GAS_DRIFT_BUFFER_PERCENT = 30n

/** Conservative fallback (USDC 6dp) when gas price or ETH/USD can't be read:
 * ~2× the typical computed fee at 1 gwei / $2k ETH. Overquoting cents beats
 * blocking checkout. */
const FALLBACK_FEE_UNITS_6DP = 3_000_000n

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

    const bufferedWei =
      (FULFILMENT_GAS_UNITS * gasPrice * (100n + GAS_DRIFT_BUFFER_PERCENT)) /
      100n

    // wei (1e18) × ethUsd8 / usdcUsd8 → USDC at 1e18 scale; ÷1e12 → 6dp units.
    const fee = (bufferedWei * prices.eth) / (prices.usdc * 10n ** 12n)

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
