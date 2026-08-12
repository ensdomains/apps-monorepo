import { useQueries, useQuery } from '@tanstack/react-query'
import {
  getBaseRateForName,
  getBaseRatesQueryOptions,
} from '@/features/register/hooks/useBaseRate'
import { getRenewalPriceQueryOptions } from '@/features/register/hooks/useRenewalPrice'
import { getStartOfToday } from '@/features/register/utils/registrationDuration'
import { isPriceResult } from '@/features/register/utils/registrationPrice'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'
import { dateToPlainDate } from '@/utils/temporal'
import {
  computeNamePricingDisplay,
  type NamePricingDisplay,
} from '../utils/computeNamePricingDisplay'
import {
  type ExtensionSpan,
  getExtensionDurationSeconds,
} from '../utils/extensionDurationPicker'
import { getRenewerAddress } from '../utils/renewer'
import type { SelectedName } from './useRenewalTransactions'

export type { NamePricingDisplay }

export type NamePricingData = {
  readonly selectedName: SelectedName
  readonly duration: number
  readonly isLoading: boolean
  readonly display: NamePricingDisplay | null
}

export type MultiNamePricingResult = {
  readonly pricingData: readonly NamePricingData[]
  readonly total: number
  readonly totalDiscount: number
  readonly allLoaded: boolean
}

export const getLatestRenewalExpiry = (
  selectedNames: readonly SelectedName[],
): Date | null =>
  selectedNames.reduce<Date | null>((max, selectedName) => {
    if (!selectedName.expiryDate) return max
    return !max || selectedName.expiryDate > max ? selectedName.expiryDate : max
  }, null)

export function useMultiNamePricing(
  selectedNames: readonly SelectedName[],
  span: ExtensionSpan,
): MultiNamePricingResult {
  const renewalInputs = selectedNames.map((selectedName) => ({
    selectedName,
    duration: getExtensionDurationSeconds(
      selectedName.expiryDate
        ? dateToPlainDate(selectedName.expiryDate)
        : getStartOfToday(),
      span,
    ),
  }))

  const priceQueries = useQueries({
    queries: renewalInputs.map((renewal) =>
      getRenewalPriceQueryOptions({
        name: renewal.selectedName.name,
        duration: renewal.duration,
        token: SUPPORTED_TOKENS.USDC,
        renewerAddress: getRenewerAddress(renewal.selectedName.isV2),
      }),
    ),
  })

  const { data: baseRates } = useQuery(getBaseRatesQueryOptions)

  const pricingData: readonly NamePricingData[] = renewalInputs.map(
    (renewal, index) => {
      const query = priceQueries[index]
      const price = query?.data && isPriceResult(query.data) ? query.data : null
      const baseRate = getBaseRateForName(baseRates, renewal.selectedName.name)

      return {
        selectedName: renewal.selectedName,
        duration: renewal.duration,
        isLoading: query?.isLoading ?? true,
        display: price
          ? computeNamePricingDisplay(
              renewal.selectedName,
              price,
              renewal.duration,
              baseRate,
            )
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
