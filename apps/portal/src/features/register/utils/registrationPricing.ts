import { formatUnits } from 'viem'
import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import {
  CHARACTER_PREMIUM_USD,
  getPremiumLabel,
  type PremiumLabelVariant,
} from '@/features/register/utils/premium'
import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { getLabel } from '@/utils/token/getLabel'

/** Standard price per year for names with more than 4 characters */
export const STANDARD_PRICE_PER_YEAR_USD = 5

/**
 * Returns the standard (full) price per year for a name based on its label length.
 * - 3 letters: $640/year
 * - 4 letters: $160/year
 * - 5+ chars: $5/year
 */
export function getStandardPricePerYear(name: string): number {
  try {
    const label = getLabel(name)
    const length = label.length
    if (length === 3) return CHARACTER_PREMIUM_USD['premium-3']
    if (length === 4) return CHARACTER_PREMIUM_USD['premium-4']
    return STANDARD_PRICE_PER_YEAR_USD
  } catch {
    return STANDARD_PRICE_PER_YEAR_USD
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
  readonly premiumLabel:
    | { label: string; variant: PremiumLabelVariant }
    | undefined
}

/**
 * Computes the pricing breakdown for display.
 *
 * Uses the same duration (seconds) and SECONDS_PER_YEAR as the contract so
 * standardSubtotal matches the contract's pre-discount amount. This avoids
 * spurious discount rows from rounding mismatches.
 *
 * Mental model:
 * - Standard subtotal = pricePerYear × (durationSeconds / SECONDS_PER_YEAR)
 * - Actual price = what the contract charges (includes multi-year discount)
 * - Discount = standard subtotal - actual price
 */
export function getPricingBreakdown(
  name: string,
  price: RegistrationPriceResult,
  durationSeconds: number,
): PricingBreakdown {
  const premiumLabel = getPremiumLabel(name)
  const pricePerYear = getStandardPricePerYear(name)

  const years = durationSeconds / CONTRACT_SECONDS_PER_YEAR
  const standardSubtotal = pricePerYear * years

  const actualPrice = Number(price.base) / 10 ** price.decimals

  const discountAmount = Math.max(0, standardSubtotal - actualPrice)

  const discountPercent =
    standardSubtotal > 0
      ? ((discountAmount / standardSubtotal) * 10000) / 100
      : 0

  const discountLabel =
    years >= 2
      ? `${Math.round(years)}+ year${Math.round(years) === 1 ? '' : 's'}`
      : ''

  return {
    pricePerYear,
    years,
    standardSubtotal,
    actualPrice,
    discountAmount,
    discountPercent,
    discountLabel,
    premiumLabel,
  }
}

/** Oracle base rate decimals (matches StandardRentPriceOracle units) */
const ORACLE_BASE_RATE_DECIMALS = 12

/**
 * Computes the discount text to display on the registration success screen,
 * using the oracle's raw per-second base rate to derive the undiscounted price.
 *
 * Returns a human-readable string like
 * "2+ years discount (10%): -$1.50" when a multi-year discount applies,
 * or undefined when there is no discount or duration is under 2 years.
 *
 * @param baseRate - Raw per-second base rate from the oracle (12-decimal units). Pass 0n when unavailable.
 * @param price    - Registration price result from the contract.
 * @param durationSeconds - Registration duration in seconds.
 */
export function getOracleDiscountText(
  baseRate: bigint,
  price: RegistrationPriceResult,
  durationSeconds: number,
): string | undefined {
  const basePriceNumber = Number(formatUnits(price.base, price.decimals))
  const basePriceWithoutDiscount =
    baseRate > 0n
      ? Number(
          formatUnits(
            baseRate * BigInt(Math.round(durationSeconds)),
            ORACLE_BASE_RATE_DECIMALS,
          ),
        )
      : 0

  const discountAmount = Math.max(basePriceWithoutDiscount - basePriceNumber, 0)
  const discountPercentage =
    basePriceWithoutDiscount > 0
      ? Math.round((discountAmount / basePriceWithoutDiscount) * 100)
      : 0

  const years = durationSeconds / CONTRACT_SECONDS_PER_YEAR

  if (discountAmount > 0 && discountPercentage > 0 && years >= 2) {
    return `${Math.floor(years)}+ years discount (${discountPercentage}%): -${formatUsd(discountAmount)}`
  }

  return undefined
}
