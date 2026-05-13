import { useQuery } from '@tanstack/react-query'
import { useBaseRate } from '@/features/register/hooks/useBaseRate'
import {
  getRegistrationPriceQueryOptions,
  type RegistrationPriceResult,
} from '@/features/register/hooks/useRegistrationPrice'
import { isPriceResult } from '@/features/register/utils/registrationPrice'
import type { ExtensionSpanType } from '../components/ExtensionDurationOrExpiryPicker'
import {
  computeNamePricingDisplay,
  type NamePricingDisplay,
} from '../utils/computeNamePricingDisplay'
import { getRenewalDurationSeconds } from './useMultiNamePricing'
import type { SelectedName } from './useRenewalTransactions'

export type NamePricingResult = {
  readonly durationSeconds: number
  readonly price: RegistrationPriceResult | null
  readonly display: NamePricingDisplay | null
  readonly isLoading: boolean
  readonly isError: boolean
  readonly error: unknown
}

export function useNamePricing(
  selectedName: SelectedName,
  duration: number,
  spanType: ExtensionSpanType,
  baseDate?: Temporal.PlainDate,
  enabled = true,
): NamePricingResult {
  const durationSeconds = getRenewalDurationSeconds({
    spanType,
    duration,
    baseDate,
  })

  const { data, isLoading, isError, error } = useQuery({
    ...getRegistrationPriceQueryOptions({
      name: selectedName.name,
      duration: durationSeconds,
    }),
    enabled: enabled && durationSeconds > 0,
  })

  const baseRate = useBaseRate(selectedName.name)

  const price = data && isPriceResult(data) ? data : null
  const display = price
    ? computeNamePricingDisplay(selectedName, price, durationSeconds, baseRate)
    : null

  return { durationSeconds, price, display, isLoading, isError, error }
}
