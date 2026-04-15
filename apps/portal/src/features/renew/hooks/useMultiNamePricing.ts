import { useQueries } from '@tanstack/react-query'
import { getRegistrationPriceQueryOptions } from '@/features/register/hooks/useRegistrationPrice'
import { isPriceResult } from '@/features/register/utils/registrationPrice'
import {
  computeNamePricingDisplay,
  type NamePricingDisplay,
} from '../utils/computeNamePricingDisplay'
import type { SelectedName } from './useRenewalTransactions'

export type { NamePricingDisplay }

export type NamePricingData = {
  readonly selectedName: SelectedName
  readonly isLoading: boolean
  readonly display: NamePricingDisplay | null
}

export type MultiNamePricingResult = {
  readonly pricingData: readonly NamePricingData[]
  readonly total: number
  readonly totalDiscount: number
  readonly allLoaded: boolean
}

export function useMultiNamePricing(
  selectedNames: readonly SelectedName[],
  duration: number,
): MultiNamePricingResult {
  const priceQueries = useQueries({
    queries: selectedNames.map((selected) =>
      getRegistrationPriceQueryOptions({ name: selected.name, duration }),
    ),
  })

  const pricingData: NamePricingData[] = selectedNames.map(
    (selectedName, index) => {
      const query = priceQueries[index]
      const price = query?.data && isPriceResult(query.data) ? query.data : null

      return {
        selectedName,
        isLoading: query?.isLoading ?? true,
        display: price
          ? computeNamePricingDisplay(selectedName, price, duration)
          : null,
      }
    },
  )

  const total = pricingData.reduce(
    (sum, item) => (item.display ? sum + item.display.actualPrice : sum),
    0,
  )
  const totalDiscount = pricingData.reduce(
    (sum, item) => (item.display ? sum + item.display.discountAmount : sum),
    0,
  )
  const allLoaded = pricingData.every((item) => !item.isLoading)

  return { pricingData, total, totalDiscount, allLoaded }
}
