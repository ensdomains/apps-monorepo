import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'

/**
 * Oracle-derived discount point: [duration in seconds, discount rate as a fraction of 1.0].
 * Mirrors the shape of the oracle's DiscountPoint struct after normalising value → [0, 1].
 */
export type OracleDiscountPoint = readonly [seconds: number, rate: number]

/**
 * Computes the integrated discount over `[0, duration)`, replicating
 * the v2 StandardRentPriceOracle.integratedDiscount() logic.
 *
 * Returns the weighted sum of (interval × discount_rate) values,
 * NOT the final percentage — divide by duration to get the effective
 * average discount.
 */
function integratedDiscount(
  durationSeconds: number,
  discountPoints: readonly OracleDiscountPoint[],
): number {
  if (durationSeconds <= 0) return 0

  let remaining = durationSeconds
  let acc = 0
  let sum = 0

  for (const [t, rate] of discountPoints) {
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
 * Returns 0 if oracle discount points are not yet loaded.
 *
 * @param durationSeconds  - Registration duration in seconds.
 * @param discountPoints   - Oracle-fetched schedule.
 * @returns A value between 0 and ~33 (percent).
 */
export function getEffectiveDiscountPercent(
  durationSeconds: number,
  discountPoints?: readonly OracleDiscountPoint[],
): number {
  if (!discountPoints || durationSeconds <= 0) return 0
  const avg =
    integratedDiscount(durationSeconds, discountPoints) / durationSeconds
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
 * Returns zero percent and empty label if oracle discount points are not yet loaded.
 *
 * @param years           - Registration duration in years.
 * @param discountPoints  - Oracle-fetched schedule.
 */
export function getDiscountForYears(
  years: number,
  discountPoints?: readonly OracleDiscountPoint[],
): {
  percent: number
  label: string
} {
  if (!discountPoints) return { percent: 0, label: '' }

  const durationSeconds = years * CONTRACT_SECONDS_PER_YEAR
  const percent = getEffectiveDiscountPercent(durationSeconds, discountPoints)

  if (percent <= 0) return { percent: 0, label: '' }

  return {
    percent: Math.round(percent * 100) / 100,
    label: `${Math.floor(years)}+ year${Math.floor(years) === 1 ? '' : 's'}`,
  }
}
