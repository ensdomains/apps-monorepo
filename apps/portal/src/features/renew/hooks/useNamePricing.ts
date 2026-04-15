import { useQuery } from '@tanstack/react-query'
import { getRegistrationPriceQueryOptions } from '@/features/register/hooks/useRegistrationPrice'
import { isPriceResult } from '@/features/register/utils/registrationPrice'
import {
  computeNamePricingDisplay,
  type NamePricingDisplay,
} from '../utils/computeNamePricingDisplay'
import type { SelectedName } from './useRenewalTransactions'

export type NamePricingResult = {
  readonly display: NamePricingDisplay | null
  readonly isLoading: boolean
  readonly isError: boolean
  readonly error: unknown
}

export function useNamePricing(
  selectedName: SelectedName,
  duration: number,
): NamePricingResult {
  const { data, isLoading, isError, error } = useQuery({
    ...getRegistrationPriceQueryOptions({ name: selectedName.name, duration }),
    enabled: duration > 0,
  })

  const price = data && isPriceResult(data) ? data : null
  const display = price
    ? computeNamePricingDisplay(selectedName, price, duration)
    : null

  return { display, isLoading, isError, error }
}
