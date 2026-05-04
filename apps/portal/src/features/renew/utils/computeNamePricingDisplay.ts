import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import { getEffectivePricePerYear } from '@/features/register/utils/registrationDiscount'
import {
  getRegistrationDisplayDates,
  getStartOfToday,
} from '@/features/register/utils/registrationDuration'
import {
  formatPriceDisplay,
  formatRegistrationTotal,
} from '@/features/register/utils/registrationPrice'
import {
  getPricingBreakdown,
  getStandardPricePerYear,
} from '@/features/register/utils/registrationPricing'
import { formatExpiryDate } from '@/utils/formatting/formatDateTime'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { dateToPlainDate } from '@/utils/temporal'
import type { SelectedName } from '../hooks/useRenewalTransactions'

export type NamePricingDisplay = {
  /** e.g. "3 years" */
  readonly registrationPeriod: string
  /** e.g. "Mar 11, 2029" */
  readonly newExpiryFormatted: string
  /** Always "Price:" — the discount is surfaced via discountSublabel */
  readonly priceLabel: string
  /** e.g. "$650/year" — per-year only; total is shown on the Total row */
  readonly priceValue: string
  /** Small green sublabel under price, e.g. "3+ yr discount price". `undefined` when no discount. */
  readonly discountSublabel: string | undefined
  /** Formatted base price e.g. "$1,462.50" */
  readonly subtotal: string
  /** Formatted base + premium total e.g. "$1,462.50" */
  readonly total: string
  /** Raw USD amount (base only) for computing multi-name totals */
  readonly actualPrice: number
  /** Raw USD discount amount for computing multi-name total savings */
  readonly discountAmount: number
}

/**
 * Pure function — computes all display values for a single name given a fetched price.
 * Shared between single-name and multi-name renewal flows.
 */
export function computeNamePricingDisplay(
  selectedName: SelectedName,
  price: RegistrationPriceResult,
  duration: number,
): NamePricingDisplay {
  const { registrationPeriod } = getRegistrationDisplayDates(duration)

  const days = Math.floor(duration / 86400)
  const baseDate = selectedName.expiryDate
    ? dateToPlainDate(selectedName.expiryDate)
    : getStartOfToday()
  const newExpiryFormatted = formatExpiryDate(baseDate.add({ days }))

  const { years, discountAmount } = getPricingBreakdown(
    selectedName.name,
    price,
    duration,
  )

  const roundedYears = Math.round(years)
  const discountSublabel =
    roundedYears >= 2 ? `${roundedYears}+ yr discount price` : undefined

  // Effective per-year derived from the design's discount curve applied to the
  // standard $/year baseline. Mirrors the year-preset chip values so the chip
  // and breakdown stay in sync. May briefly differ from `Total / years` until
  // the contract reflects the new curve.
  const effectivePerYear = getEffectivePricePerYear(
    getStandardPricePerYear(selectedName.name),
    years,
  )

  const priceValue =
    Math.round(years * 12) >= 12
      ? `${formatUsd(effectivePerYear)}/year`
      : formatUsd(effectivePerYear)

  const actualPrice = Number(price.base) / 10 ** price.decimals

  return {
    registrationPeriod,
    newExpiryFormatted,
    priceLabel: 'Price:',
    priceValue,
    discountSublabel,
    subtotal: formatPriceDisplay(price.base, price.decimals),
    total: formatRegistrationTotal(price.base, price.premium, price.decimals),
    actualPrice,
    discountAmount,
  }
}
