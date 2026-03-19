import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import {
  CHARACTER_PREMIUM_USD,
  getPremiumLabel,
  type PremiumLabelVariant,
} from '@/features/register/utils/premium'
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

 * Mental model:
 * - Standard price = full price per year for this name type (constants)
 * - Standard subtotal = standard price × years (what you'd pay at full price)
 * - Actual price = what the contract charges (already includes multi-year discount)
 * - Discount = standard subtotal - actual price (the difference is your savings)
 */
export function getPricingBreakdown(
  name: string,
  price: RegistrationPriceResult,
  years: number,
): PricingBreakdown {
  const premiumLabel = getPremiumLabel(name)
  const pricePerYear = getStandardPricePerYear(name)

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
    standardSubtotal,
    actualPrice,
    discountAmount,
    discountPercent,
    discountLabel,
    premiumLabel,
  }
}
