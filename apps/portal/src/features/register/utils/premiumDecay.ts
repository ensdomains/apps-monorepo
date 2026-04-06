/**
 * Premium decay calculation utilities for the v2 StandardRentPriceOracle.
 *
 * The temporary premium follows an exponential halving decay:
 *   price(t) = START_PRICE * FACTOR^(days) - OFFSET
 *
 * Contract parameters (from StandardRentPriceOracle):
 *   - Premium period: 21 days (starts immediately at expiry, no grace period)
 *   - Halving period: 1 day (price halves daily)
 *   - Start price: 100,000,000 (base pricing units)
 *   - Offset: ensures curve reaches exactly 0 at the end of the premium period
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Total premium window duration (21 days) in milliseconds. */
export const PREMIUM_PERIOD_MS = 21 * MS_PER_DAY

/** Start price of the exponential decay (in display units, e.g. USD). */
const START_PRICE = 100_000_000

/** Offset subtracted so the curve reaches exactly 0 at the end of premium period. */
const OFFSET = 47.6837158203125

/** Decay factor per day — price halves daily. */
const FACTOR = 0.5

export type PremiumInstantRange = {
  start: Temporal.Instant
  end: Temporal.Instant
}

/**
 * Calculates the premium window as a pair of Temporal.Instant values.
 * Use this in all business logic; convert to Date only at UI/library boundaries.
 */
export function getPremiumInstantRange(
  currentPremiumUsd: number,
  now: Temporal.Instant = Temporal.Now.instant(),
): PremiumInstantRange | null {
  if (currentPremiumUsd <= 0) return null

  const days =
    Math.log((currentPremiumUsd + OFFSET) / START_PRICE) / Math.log(FACTOR)
  const elapsedMs = days * MS_PER_DAY

  const startMs = Math.round(now.epochMilliseconds - elapsedMs)
  const endMs = startMs + PREMIUM_PERIOD_MS
  return {
    start: Temporal.Instant.fromEpochMilliseconds(startMs),
    end: Temporal.Instant.fromEpochMilliseconds(endMs),
  }
}

/**
 * Derives the premium instant range from a registration price result.
 * Returns null if the price has no premium.
 */
export function getPremiumInstantRangeFromPrice(price: {
  premium: bigint
  decimals: number
  hasPremium: boolean
}): PremiumInstantRange | null {
  if (!price.hasPremium) return null

  const premiumUsd = Number(price.premium) / 10 ** price.decimals
  return getPremiumInstantRange(premiumUsd)
}

/**
 * Calculates the premium price at a given instant.
 *
 * @param start  - When the premium period began (= name expiry).
 * @param target - The instant to calculate the price for.
 * @returns The premium price in USD, or 0 if outside the premium window.
 */
export function getPremiumPriceAtInstant(
  start: Temporal.Instant,
  target: Temporal.Instant,
): number {
  const elapsedMs = target.epochMilliseconds - start.epochMilliseconds
  if (elapsedMs < 0) return START_PRICE - OFFSET
  if (elapsedMs >= PREMIUM_PERIOD_MS) return 0

  const days = elapsedMs / MS_PER_DAY
  return Math.max(START_PRICE * FACTOR ** days - OFFSET, 0)
}

/**
 * Calculates the instant when the premium will reach a given target price.
 *
 * Inverts the decay formula:
 *   days = log((price + OFFSET) / START_PRICE) / log(FACTOR)
 *
 * @param start       - When the premium period began (= name expiry).
 * @param targetPrice - The desired premium price in USD.
 * @returns The Temporal.Instant when premium reaches that price, clamped to the premium window.
 */
export function getInstantForPremiumPrice(
  start: Temporal.Instant,
  targetPrice: number,
): Temporal.Instant {
  const startMs = start.epochMilliseconds
  const endMs = startMs + PREMIUM_PERIOD_MS

  if (targetPrice >= START_PRICE - OFFSET) {
    return Temporal.Instant.fromEpochMilliseconds(startMs)
  }
  if (targetPrice <= 0) {
    return Temporal.Instant.fromEpochMilliseconds(endMs)
  }

  const days = Math.log((targetPrice + OFFSET) / START_PRICE) / Math.log(FACTOR)
  const dateMs = startMs + days * MS_PER_DAY
  const clamped = Math.round(Math.max(startMs, Math.min(dateMs, endMs)))
  return Temporal.Instant.fromEpochMilliseconds(clamped)
}
