/**
 * Premium decay calculation utilities.
 *
 * The temporary premium follows an exponential halving decay:
 *   price(t) = startPrice * FACTOR^(t / resolutionPerDay) - OFFSET
 *
 * Constants match the v2 StandardRentPriceOracle deployment:
 *   - Premium period: 21 days
 *   - Halving period: 1 day (price halves daily)
 *   - Start price: $100,000,000 (in base units)
 *
 * Grace period is 90 days after name expiry, then premium period begins.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Grace period after name expiry before premium begins (90 days). */
export const GRACE_PERIOD_MS = 90 * MS_PER_DAY

/** Total premium window duration (21 days). */
export const PREMIUM_PERIOD_MS = 21 * MS_PER_DAY

/** Start price of the exponential decay (in display units, e.g. USD). */
const START_PRICE = 100_000_000

/** Offset subtracted so the curve reaches exactly 0 at the end of premium period. */
const OFFSET = 47.6837158203125

/** Decay factor per day — price halves daily. */
const FACTOR = 0.5

/**
 * Calculates the premium end date from a name's previous expiry timestamp.
 *
 * @param expiryTimestamp - The name's expiry as a bigint (seconds since epoch from contract).
 * @returns The Date when the temporary premium reaches $0.
 */
export function getPremiumEndDate(expiryTimestamp: bigint): Date {
  const expiryMs = Number(expiryTimestamp) * 1000
  return new Date(expiryMs + GRACE_PERIOD_MS + PREMIUM_PERIOD_MS)
}

/**
 * Calculates the grace period end date (= premium start date) from expiry.
 */
export function getGracePeriodEndDate(expiryTimestamp: bigint): Date {
  return new Date(Number(expiryTimestamp) * 1000 + GRACE_PERIOD_MS)
}

/**
 * Calculates the premium price at a given date.
 *
 * @param premiumStartDate - When the premium period begins (grace period end).
 * @param targetDate - The date to calculate the price for.
 * @returns The premium price in USD, or 0 if outside premium window.
 */
export function getPremiumPriceAtDate(
  premiumStartDate: Date,
  targetDate: Date,
): number {
  const elapsedMs = targetDate.getTime() - premiumStartDate.getTime()
  if (elapsedMs < 0) return START_PRICE - OFFSET
  if (elapsedMs >= PREMIUM_PERIOD_MS) return 0

  const days = elapsedMs / MS_PER_DAY
  return Math.max(START_PRICE * FACTOR ** days - OFFSET, 0)
}

/**
 * Calculates the date when the premium will reach a given price.
 *
 * Inverts the decay formula:
 *   price = startPrice * FACTOR^days - OFFSET
 *   days = log((price + OFFSET) / startPrice) / log(FACTOR)
 *
 * @param premiumStartDate - When the premium period begins (grace period end).
 * @param targetPrice - The desired premium price in USD.
 * @returns The Date when premium reaches that price, clamped to the premium window.
 */
export function getDateForPremiumPrice(
  premiumStartDate: Date,
  targetPrice: number,
): Date {
  if (targetPrice >= START_PRICE - OFFSET) return premiumStartDate

  const premiumEndDate = new Date(
    premiumStartDate.getTime() + PREMIUM_PERIOD_MS,
  )
  if (targetPrice <= 0) return premiumEndDate

  const days = Math.log((targetPrice + OFFSET) / START_PRICE) / Math.log(FACTOR)
  const dateMs = premiumStartDate.getTime() + days * MS_PER_DAY

  const clamped = Math.max(
    premiumStartDate.getTime(),
    Math.min(dateMs, premiumEndDate.getTime()),
  )
  return new Date(clamped)
}
