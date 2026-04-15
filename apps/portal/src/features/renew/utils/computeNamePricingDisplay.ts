import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import {
  getRegistrationDisplayDates,
  getStartOfToday,
} from '@/features/register/utils/registrationDuration'
import {
  formatPriceDisplay,
  formatRegistrationTotal,
} from '@/features/register/utils/registrationPrice'
import { getPricingBreakdown } from '@/features/register/utils/registrationPricing'
import { formatExpiryDate } from '@/utils/formatting/formatDateTime'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { dateToPlainDate } from '@/utils/temporal'
import type { SelectedName } from '../hooks/useRenewalTransactions'

export type NamePricingDisplay = {
  /** e.g. "3 years" */
  readonly registrationPeriod: string
  /** e.g. "Mar 11, 2029" */
  readonly newExpiryFormatted: string
  /** "Price:" or "Price (25% discount):" */
  readonly priceLabel: string
  /** e.g. "$650/year × 3" */
  readonly priceValue: string
  /** Formatted base price e.g. "$1,462.50" */
  readonly subtotal: string
  /** Formatted base + premium total e.g. "$1,462.50" */
  readonly total: string
  /** Raw USD amount (base only) for computing multi-name totals */
  readonly actualPrice: number
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

  const { pricePerYear, years, discountPercent } = getPricingBreakdown(
    selectedName.name,
    price,
    duration,
  )

  const priceLabel =
    discountPercent > 0
      ? `Price (${Math.round(discountPercent)}% discount):`
      : 'Price:'

  const priceValue =
    Math.round(years * 12) >= 12
      ? `${formatUsd(pricePerYear)}/year × ${Math.round(years)}`
      : formatUsd(pricePerYear)

  return {
    registrationPeriod,
    newExpiryFormatted,
    priceLabel,
    priceValue,
    subtotal: formatPriceDisplay(price.base, price.decimals),
    total: formatRegistrationTotal(price.base, price.premium, price.decimals),
    actualPrice: Number(price.base) / 10 ** price.decimals,
  }
}
