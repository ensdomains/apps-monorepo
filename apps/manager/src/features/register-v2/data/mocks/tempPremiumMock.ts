/**
 * Dev-only simulation for the temporary premium cooldown.
 *
 * What this does
 * --------------
 * When `VITE_FF_MOCK_TEMP_PREMIUM_LABELS` lists a label (e.g. `tem,foo`),
 * we pretend that label just exited its grace period N days ago and is
 * mid-decay through the 21-day cooldown window. The mock returns a
 * `{basePrice, premium, totalPrice}` shaped exactly like the real
 * `rentPrice` contract call, with `premium` computed using the LIVE oracle
 * decay config (fetched once and cached) so the chart's `nowPoint`,
 * `premiumStartDate`, and refetch-driven animation all behave correctly.
 *
 * What this does NOT do
 * ---------------------
 * - It does not write to chain — clicking "Pay with stablecoins" will fail
 *   when the real registrar sees the mocked label is unavailable / not in
 *   premium. This is for visual + flow inspection only.
 * - It does not mock oracle params or base rates — those come from chain
 *   normally (Sepolia). The mock builds on top of them.
 *
 * Env vars
 * --------
 * - `VITE_FF_MOCK_TEMP_PREMIUM_LABELS`: comma-separated labels without `.eth`,
 *   case-insensitive (e.g. `tem,vitalik,nick`). Empty / unset = mock disabled.
 * - `VITE_FF_MOCK_TEMP_PREMIUM_AGE_DAYS`: how many days into the 21-day
 *   window to start the simulation. Smaller = higher premium. Default `6.5`.
 *
 * All gated by `import.meta.env.DEV` — never active in production builds.
 */

import {
  type SUPPORTED_TOKEN,
  TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { parseUnits } from 'viem'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { getLabelLength } from '../../utils/name-parser'
import {
  getPremiumPriceAtInstant,
  type PremiumDecayConfig,
} from '../../workflow/pricing/lib/premiumDecay'
import { ORACLE_PRICE_DECIMALS } from '../../workflow/pricing/lib/oracle'
import { getBaseRates } from '../queries/baseRates.query'
import { getOracleParams } from '../queries/oracleParams.query'
import { mockNow } from './mockClock'

const MS_PER_DAY = 24 * 60 * 60 * 1000

const MOCK_LABELS: ReadonlySet<string> = (() => {
  const raw = import.meta.env.VITE_FF_MOCK_TEMP_PREMIUM_LABELS ?? ''
  return new Set(
    raw
      .split(',')
      .map((s: string) => s.trim().toLowerCase().replace(/\.eth$/, ''))
      .filter(Boolean),
  )
})()

const MOCK_AGE_DAYS: number = (() => {
  const raw = import.meta.env.VITE_FF_MOCK_TEMP_PREMIUM_AGE_DAYS
  const parsed = Number.parseFloat(raw ?? '')
  if (!Number.isFinite(parsed) || parsed < 0) return 6.5
  return parsed
})()

/** True if the label should be treated as in temporary premium for dev/QA. */
export function isTempPremiumMocked(label: string): boolean {
  if (!import.meta.env.DEV) return false
  if (MOCK_LABELS.size === 0) return false
  return MOCK_LABELS.has(label.trim().toLowerCase().replace(/\.eth$/, ''))
}

// Module-level promise singletons. Both queries already have staleTime:Infinity
// in TanStack, but the mock runs outside a query context so we cache locally.
// First call fetches; subsequent calls reuse the same Promise.
let cachedDecayPromise: Promise<PremiumDecayConfig> | null = null
let cachedBaseRatesPromise: Promise<readonly bigint[]> | null = null

async function fetchDecayConfig(): Promise<PremiumDecayConfig> {
  const result = await getOracleParams()
  if (result.isErr()) {
    // Reset so a later call can retry.
    cachedDecayPromise = null
    throw result.error
  }
  return result.value.premiumDecay
}

async function fetchBaseRates(): Promise<readonly bigint[]> {
  const result = await getBaseRates()
  if (result.isErr()) {
    cachedBaseRatesPromise = null
    throw result.error
  }
  return result.value
}

function getDecayConfigCached(): Promise<PremiumDecayConfig> {
  if (!cachedDecayPromise) {
    cachedDecayPromise = fetchDecayConfig()
  }
  return cachedDecayPromise
}

function getBaseRatesCached(): Promise<readonly bigint[]> {
  if (!cachedBaseRatesPromise) {
    cachedBaseRatesPromise = fetchBaseRates()
  }
  return cachedBaseRatesPromise
}

export type MockedPricing = {
  basePrice: bigint
  premium: bigint
  totalPrice: bigint
  token: SUPPORTED_TOKEN
  durationInSeconds: number
}

/**
 * Build a synthetic `{basePrice, premium, totalPrice}` that mirrors what the
 * registrar's `rentPrice` would return for a name N days into its 21-day
 * cooldown. Premium is recomputed on every call from `Date.now()`, so calling
 * this on the pricing query's refetch interval (60s) makes the cart total
 * visibly decay over time — exactly the production flow.
 */
export async function buildMockedPricing(
  durationInSeconds: number,
  token: SUPPORTED_TOKEN,
  label: string,
): Promise<MockedPricing> {
  const [decay, baseRates] = await Promise.all([
    getDecayConfigCached(),
    getBaseRatesCached(),
  ])

  // Anchor a fake premium-window start at module load. Keeping it stable for
  // the page session means `premiumStartDate` (back-solved from premium) lands
  // in the same place each refetch, so the chart axis doesn't shift.
  const fakeWindowStartMs = mockStartMs(decay)

  // Live premium USD at this instant on the synthetic curve. Use mockNow()
  // (not Date.now()) so under VITE_FF_MOCK_TEMP_PREMIUM_TIME_SCALE this
  // tracks the same virtual clock as the banner pill and chart `now` dot.
  // Otherwise the cart total stays anchored to wall-clock decay while the
  // pill advances at scale × wall-clock, and the two numbers drift apart.
  const premiumUsd = getPremiumPriceAtInstant(
    fakeWindowStartMs,
    mockNow(),
    decay,
  )

  // Base price: oracle-precision USD per second × duration. Mirrors the
  // discount-aware math in DurationSelector but without applying the discount
  // (the contract's `rentPrice` returns the discounted figure; we approximate
  // by using the per-second rate directly — close enough for a visual mock).
  const labelLength = Math.min(getLabelLength(label), baseRates.length)
  const baseRatePerSecond = baseRates[labelLength - 1] ?? 0n
  const basePriceOracleScaled =
    baseRatePerSecond * BigInt(Math.ceil(durationInSeconds))
  const basePriceUsd = decimalBigintToNumber(
    basePriceOracleScaled,
    ORACLE_PRICE_DECIMALS,
  )

  const tokenDecimals = TOKENS[token].decimals
  const basePrice = parseUnits(basePriceUsd.toFixed(tokenDecimals), tokenDecimals)
  const premium = parseUnits(premiumUsd.toFixed(tokenDecimals), tokenDecimals)

  return {
    basePrice,
    premium,
    totalPrice: basePrice + premium,
    token,
    durationInSeconds,
  }
}

// Module-stable so refetches give consistent back-solved start dates.
// Anchored on the same virtual clock as the rest of the simulation so the
// "this label is N days into its cooldown" semantics hold regardless of
// VITE_FF_MOCK_TEMP_PREMIUM_TIME_SCALE.
let cachedFakeWindowStartMs: number | null = null
function mockStartMs(_decay: PremiumDecayConfig): number {
  if (cachedFakeWindowStartMs !== null) return cachedFakeWindowStartMs
  cachedFakeWindowStartMs = mockNow() - MOCK_AGE_DAYS * MS_PER_DAY
  return cachedFakeWindowStartMs
}

/** Mocked availability response — matches the shape of checkRealNameAvailability. */
export function buildMockedAvailability(label: string): {
  isAvailable: boolean
  name: string
} {
  const clean = label.trim().toLowerCase().replace(/\.eth$/, '')
  return { isAvailable: true, name: `${clean}.eth` }
}
