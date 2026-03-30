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

import { Temporal } from '@js-temporal/polyfill'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Total premium window duration (21 days). */
export const PREMIUM_PERIOD_MS = 21 * MS_PER_DAY

/** Start price of the exponential decay (in display units, e.g. USD). */
const START_PRICE = 100_000_000

/** Offset subtracted so the curve reaches exactly 0 at the end of premium period. */
const OFFSET = 47.6837158203125

/** Decay factor per day — price halves daily. */
const FACTOR = 0.5

export type PremiumDatesResult = {
  premiumStartDate: Date
  premiumEndDate: Date
}

/**
 * Derives the premium start/end dates from a registration price result.
 *
 * Returns null if the price has no premium. Use this when you have a
 * RegistrationPriceResult from the price query.
 */
export function getPremiumDatesFromRegistrationPrice(price: {
  premium: bigint
  decimals: number
  hasPremium: boolean
}): PremiumDatesResult | null {
  if (!price.hasPremium) return null

  const premiumUsd = Number(price.premium) / 10 ** price.decimals
  return getPremiumDatesFromPrice(premiumUsd)
}

/**
 * Derives the premium start/end dates from the current premium price.
 *
 * Since the contract's `getExpiry` returns 0 for available names, we can't rely
 * on it. Instead, we invert the decay formula to determine how far into the
 * premium window we are, based on the price the contract returned.
 *
 *   premium = START_PRICE * FACTOR^days - OFFSET
 *   days = log((premium + OFFSET) / START_PRICE) / log(FACTOR)
 *   premiumStartDate = now - days
 *   premiumEndDate = premiumStartDate + 21 days
 */
export function getPremiumDatesFromPrice(
  currentPremiumUsd: number,
): PremiumDatesResult | null {
  if (currentPremiumUsd <= 0) return null

  const days =
    Math.log((currentPremiumUsd + OFFSET) / START_PRICE) / Math.log(FACTOR)

  const elapsedMs = days * MS_PER_DAY

  const nowMs = Temporal.Now.instant().epochMilliseconds
  const premiumStartMs = nowMs - elapsedMs
  const premiumEndMs = premiumStartMs + PREMIUM_PERIOD_MS

  const premiumStartDate = new Date(premiumStartMs)
  const premiumEndDate = new Date(premiumEndMs)

  return { premiumStartDate, premiumEndDate }
}

/**
 * Calculates the premium price at a given date.
 *
 * @param premiumStartDate - When the premium period began (= name expiry date).
 * @param targetDate - The date to calculate the price for.
 * @returns The premium price in USD, or 0 if outside the premium window.
 */
export function getPremiumPriceAtDate(
  premiumStartDate: Date,
  targetDate: Date,
): number {
  const elapsedMs =
    Temporal.Instant.fromEpochMilliseconds(targetDate.getTime())
      .epochMilliseconds -
    Temporal.Instant.fromEpochMilliseconds(premiumStartDate.getTime())
      .epochMilliseconds
  if (elapsedMs < 0) return START_PRICE - OFFSET
  if (elapsedMs >= PREMIUM_PERIOD_MS) return 0

  const days = elapsedMs / MS_PER_DAY
  return Math.max(START_PRICE * FACTOR ** days - OFFSET, 0)
}

/**
 * Calculates the date when the premium will reach a given target price.
 *
 * Inverts the decay formula:
 *   days = log((price + OFFSET) / START_PRICE) / log(FACTOR)
 *
 * @param premiumStartDate - When the premium period began (= name expiry date).
 * @param targetPrice - The desired premium price in USD.
 * @returns The Date when premium reaches that price, clamped to the premium window.
 */
export function getDateForPremiumPrice(
  premiumStartDate: Date,
  targetPrice: number,
): Date {
  if (targetPrice >= START_PRICE - OFFSET) return premiumStartDate

  const premiumStartMs = Temporal.Instant.fromEpochMilliseconds(
    premiumStartDate.getTime(),
  ).epochMilliseconds
  const premiumEndMs = premiumStartMs + PREMIUM_PERIOD_MS
  const premiumEndDate = new Date(premiumEndMs)

  if (targetPrice <= 0) return premiumEndDate

  const days = Math.log((targetPrice + OFFSET) / START_PRICE) / Math.log(FACTOR)
  const dateMs = premiumStartMs + days * MS_PER_DAY

  const clamped = Math.max(
    premiumStartMs,
    Math.min(dateMs, premiumEndDate.getTime()),
  )
  return new Date(clamped)
}
