import { SECONDS_PER_YEAR } from '@/lib/constants/duration'

/**
 * Discount points matching the v2 StandardRentPriceOracle deployment config.
 * Each entry: [interval in seconds, discount rate as a decimal (0–1)].
 *
 * The contract uses a piecewise-linear integrated discount function.
 * Longer registrations accumulate more discount via a weighted average
 * over these intervals.
 *
 * @see contracts-v2/contracts/deploy/02_StandardRentPriceOracle.ts
 * @see contracts-v2/contracts/src/registrar/StandardRentPriceOracle.sol
 */
const DISCOUNT_POINTS: readonly [seconds: number, rate: number][] = [
  [SECONDS_PER_YEAR, 0], // Year 1: 0%
  [SECONDS_PER_YEAR, 0.1], // Year 2: 10%
  [SECONDS_PER_YEAR, 0.2], // Year 3: 20%
  [SECONDS_PER_YEAR * 2, 0.2875], // Years 4–5: 28.75%
  [SECONDS_PER_YEAR * 5, 0.325], // Years 6–10: 32.5%
  [SECONDS_PER_YEAR * 15, 1 / 3], // Years 11–25: 33.33%
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
  const durationSeconds = years * SECONDS_PER_YEAR
  const percent = getEffectiveDiscountPercent(durationSeconds)

  if (percent <= 0) return { percent: 0, label: '' }

  return {
    percent: Math.round(percent * 100) / 100,
    label: `${Math.floor(years)}+ year${Math.floor(years) === 1 ? '' : 's'}`,
  }
}
