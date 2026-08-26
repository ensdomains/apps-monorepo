import { useQuery } from '@tanstack/react-query'
import { useBaseRate } from '@/features/register/hooks/useBaseRate'
import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import { getRenewalPriceQueryOptions } from '@/features/register/hooks/useRenewalPrice'
import { getStartOfToday } from '@/features/register/utils/registrationDuration'
import { isPriceResult } from '@/features/register/utils/registrationPrice'
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
  span: ExtensionSpan,
  baseDate?: Temporal.PlainDate,
  enabled = true,
): NamePricingResult {
  const durationSeconds = getExtensionDurationSeconds(
    baseDate ?? getStartOfToday(),
    span,
  )

  const { data, isLoading, isError, error } = useQuery({
    ...getRenewalPriceQueryOptions({
      name: selectedName.name,
      duration: durationSeconds,
      renewerAddress: getRenewerAddress(selectedName.isV2),
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
