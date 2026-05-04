import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'

/**
 * Discount points matching the v2 StandardRentPriceOracle deployment config.
 * Uses CONTRACT_SECONDS_PER_YEAR so intervals match the contract exactly.
 *
 * @see contracts-v2/contracts/deploy/02_StandardRentPriceOracle.ts
 * @see contracts-v2/contracts/src/registrar/StandardRentPriceOracle.sol
 */
// Integrated piecewise-constant discount curve. Average discount over N years:
//   1y→0%, 2y→12.5%, 3y→31.25%, 4y→37.5%, 5y→41.25%, 6y→43.75%, 7y+→43.75% (extrapolated)
const DISCOUNT_POINTS: readonly [seconds: number, rate: number][] = [
  [CONTRACT_SECONDS_PER_YEAR, 0], // Year 1: 0% interval rate
  [CONTRACT_SECONDS_PER_YEAR, 0.25], // Year 2: 25% interval rate
  [CONTRACT_SECONDS_PER_YEAR, 0.6875], // Year 3: 68.75% interval rate
  [CONTRACT_SECONDS_PER_YEAR * 3, 0.5625], // Years 4–6: 56.25% interval rate
  // Years 7+: integratedDiscount() extrapolates with the running average (= 43.75%)
]

/**
 * Computes the integrated discount over `[0, duration)`, replicating
 * the v2 StandardRentPriceOracle.integratedDiscount() logic.
 *
 * Returns the weighted sum of (interval × discount_rate) values,
 * NOT the final percentage — divide by duration to get the effective
 * average discount.
 */
function integratedDiscount(durationSeconds: number): number {
  if (durationSeconds <= 0) return 0

  let remaining = durationSeconds
  let acc = 0
  let sum = 0

  for (const [t, rate] of DISCOUNT_POINTS) {
    if (remaining <= t) {
      return acc + remaining * rate
    }
    remaining -= t
    acc += t * rate
    sum += t
  }

  // Beyond all defined points: extrapolate using the weighted average
  // of defined points (matches the contract's extrapolation).
  if (sum > 0) {
    acc += (remaining * acc) / sum
  }

  return acc
}

/**
 * Computes the effective average discount percentage for a given duration
 * in seconds, matching the v2 contract's piecewise-linear discount function.
 *
 * Returns a value between 0 and ~33 (percent).
 */
export function getEffectiveDiscountPercent(durationSeconds: number): number {
  if (durationSeconds <= 0) return 0
  const avg = integratedDiscount(durationSeconds) / durationSeconds
  return avg * 100
}

/**
 * Formats the discount percent for display. Use this in both presets and
 * summary so the same value is shown consistently (e.g. "17.5%" not "18%"
 * in one place and "17.5%" in another).
 */
export function formatDiscountPercentForDisplay(percent: number): string {
  if (percent <= 0) return '0%'
  const formatted =
    percent % 1 === 0 ? String(percent) : percent.toFixed(1).replace(/\.0$/, '')
  return `${formatted}%`
}

/**
 * Returns the effective discount percent and a human-readable label
 * for a given number of years.
 */
export function getDiscountForYears(years: number): {
  percent: number
  label: string
} {
  const durationSeconds = years * CONTRACT_SECONDS_PER_YEAR
  const percent = getEffectiveDiscountPercent(durationSeconds)

  if (percent <= 0) return { percent: 0, label: '' }

  return {
    percent: Math.round(percent * 100) / 100,
    label: `${Math.floor(years)}+ year${Math.floor(years) === 1 ? '' : 's'}`,
  }
}

/**
 * Returns the effective per-year price (after duration discount) for a given
 * base price and number of years. Used by the year preset chips.
 */
export function getEffectivePricePerYear(
  basePricePerYear: number,
  years: number,
): number {
  if (basePricePerYear <= 0 || years <= 0) return 0
  const durationSeconds = years * CONTRACT_SECONDS_PER_YEAR
  const percent = getEffectiveDiscountPercent(durationSeconds)
  return basePricePerYear * (1 - percent / 100)
}
