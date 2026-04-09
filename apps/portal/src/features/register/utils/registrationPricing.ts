import type { OracleParams } from '@/features/register/hooks/useOracleParams'
import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import {
  getPremiumLabel,
  type PremiumLabel,
} from '@/features/register/utils/premium'
import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'
import { getLabel } from '@/utils/token/getLabel'

/** type(uint128).max — the scale factor used by the oracle for discount values. */
const DISCOUNT_SCALE = (1n << 128n) - 1n

/**
 * Converts the contract's integratedDiscount() return value to an effective
 * average discount percentage for a given duration.
 *
 * Formula: percent = (integratedDiscount / (DISCOUNT_SCALE × duration)) × 100
 *
 * BigInt division is used to preserve precision on the large uint256 values
 * returned by the contract.
 */
export function integratedDiscountToPercent(
  integratedResult: bigint,
  durationSeconds: number,
): number {
  if (integratedResult === 0n || durationSeconds === 0) return 0
  // Scale by 1e6 before dividing to preserve 2 decimal places of precision
  const scaled =
    (integratedResult * 1_000_000n) / (DISCOUNT_SCALE * BigInt(durationSeconds))
  return Number(scaled) / 10_000
}

/**
 * Returns the USD price per year for a label of the given length,
 * using oracle-fetched base rates (0-indexed: index 0 = 1-char label).
 * Labels longer than the array use the last entry.
 */
export function getBaseRateUsdForLength(
  baseRatesUsd: number[],
  labelLength: number,
): number {
  if (baseRatesUsd.length === 0) return 0
  // Mirrors the contract: _baseRatePerCp[(ncp > nbr ? nbr : ncp) - 1]
  // i.e. clamp labelLength to [1, array.length] then convert to 0-based index.
  const idx = Math.min(Math.max(labelLength - 1, 0), baseRatesUsd.length - 1)
  return baseRatesUsd[idx] ?? 0
}

/**
 * Returns the USD price per year for the given name using oracle base rates.
 * Returns undefined when oracle data is unavailable or the name is invalid.
 */
export function getPricePerYearUsd(
  oracleData: OracleParams | undefined,
  name: string,
): number | undefined {
  if (!oracleData) return undefined
  try {
    const labelLength = getLabel(name).length
    return getBaseRateUsdForLength(oracleData.baseRatesUsd, labelLength)
  } catch {
    return undefined
  }
}

export type PricingBreakdown = {
  readonly pricePerYear: number
  readonly years: number
  readonly standardSubtotal: number
  readonly actualPrice: number
  readonly discountAmount: number
  readonly discountPercent: number
  readonly discountLabel: string
  readonly premiumLabel: PremiumLabel | undefined
}

/**
 * Computes the pricing breakdown for display.
 *
 * Mental model:
 * - Standard subtotal = pricePerYear × years (undiscounted)
 * - discountPercent = from integratedDiscount() contract call (authoritative)
 * - discountAmount = standardSubtotal × discountPercent / 100
 * - Actual price = what the contract charges (includes discount + rounding)
 *
 * @param name            - The ENS name being registered (used for premium label).
 * @param price           - Oracle-fetched price result for the full duration.
 * @param durationSeconds - Registration duration in seconds.
 * @param pricePerYearUsd - Oracle base rate for this name length in USD/year.
 *                          When undefined (oracle loading), breakdown rows are hidden.
 * @param discountPercent - Effective discount % from integratedDiscount() contract call.
 *                          When undefined (query loading), discount rows are hidden.
 */
export function getPricingBreakdown(
  name: string,
  price: RegistrationPriceResult,
  durationSeconds: number,
  pricePerYearUsd: number | undefined,
  discountPercent: number | undefined,
): PricingBreakdown {
  const premiumLabel = getPremiumLabel(name)
  const years = durationSeconds / CONTRACT_SECONDS_PER_YEAR
  const actualPrice = Number(price.base) / 10 ** price.decimals

  if (!pricePerYearUsd || discountPercent === undefined) {
    return {
      pricePerYear: 0,
      years,
      standardSubtotal: 0,
      actualPrice,
      discountAmount: 0,
      discountPercent: 0,
      discountLabel: '',
      premiumLabel,
    }
  }

  const standardSubtotal = pricePerYearUsd * years
  const discountAmount = standardSubtotal * (discountPercent / 100)
  const discountLabel = years >= 2 ? `${Math.floor(years)}+ years` : ''

  return {
    pricePerYear: pricePerYearUsd,
    years,
    standardSubtotal,
    actualPrice,
    discountAmount,
    discountPercent,
    discountLabel,
    premiumLabel,
  }
}
