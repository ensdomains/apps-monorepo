import { useQueries } from '@tanstack/react-query'
import { getRegistrationPriceQueryOptions } from '@/features/register/hooks/useRegistrationPrice'
import {
  getRegistrationDisplayDates,
  getStartOfToday,
} from '@/features/register/utils/registrationDuration'
import {
  formatPriceDisplay,
  isPriceResult,
} from '@/features/register/utils/registrationPrice'
import { getPricingBreakdown } from '@/features/register/utils/registrationPricing'
import { formatExpiryDate } from '@/utils/formatting/formatDateTime'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { dateToPlainDate } from '@/utils/temporal'
import type { SelectedName } from './useRenewalTransactions'

export type NamePricingData = {
  readonly selectedName: SelectedName
  readonly isLoading: boolean
  /** e.g. "3 years" */
  readonly registrationPeriod: string
  /** e.g. "Mar 11, 2029" */
  readonly newExpiryFormatted: string
  /** "Price:" or "Price (25% discount):" */
  readonly priceLabel: string
  /** e.g. "$650/year × 3" — null while loading */
  readonly priceValue: string | null
  /** Formatted subtotal e.g. "$1,462.50" — null while loading */
  readonly subtotal: string | null
  /** Raw USD amount for computing totals — null while loading */
  readonly actualPrice: number | null
}

export function useMultiNamePricing(
  selectedNames: readonly SelectedName[],
  duration: number,
): readonly NamePricingData[] {
  const priceQueries = useQueries({
    queries: selectedNames.map((selected) =>
      getRegistrationPriceQueryOptions({ name: selected.name, duration }),
    ),
  })

  const { registrationPeriod } = getRegistrationDisplayDates(duration)
  const days = Math.floor(duration / 86400)

  return selectedNames.map((selectedName, index) => {
    const query = priceQueries[index]
    const price = query?.data && isPriceResult(query.data) ? query.data : null

    const baseDate = selectedName.expiryDate
      ? dateToPlainDate(selectedName.expiryDate)
      : getStartOfToday()
    const newExpiry = baseDate.add({ days })
    const newExpiryFormatted = formatExpiryDate(newExpiry)

    if (!price) {
      return {
        selectedName,
        isLoading: query?.isLoading ?? true,
        registrationPeriod,
        newExpiryFormatted,
        priceLabel: 'Price:',
        priceValue: null,
        subtotal: null,
        actualPrice: null,
      }
    }

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

    const actualPrice = Number(price.base) / 10 ** price.decimals

    return {
      selectedName,
      isLoading: false,
      registrationPeriod,
      newExpiryFormatted,
      priceLabel,
      priceValue,
      subtotal: formatPriceDisplay(price.base, price.decimals),
      actualPrice,
    }
  })
}
