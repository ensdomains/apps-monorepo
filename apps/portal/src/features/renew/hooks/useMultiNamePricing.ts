import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  getBaseRateForName,
  getBaseRatesQueryOptions,
} from '@/features/register/hooks/useBaseRate'
import { getRenewalPriceQueryOptions } from '@/features/register/hooks/useRenewalPrice'
import {
  getDurationInSecondsFromYears,
  getStartOfToday,
} from '@/features/register/utils/registrationDuration'
import { isPriceResult } from '@/features/register/utils/registrationPrice'
import {
  MIN_REGISTRATION_DURATION,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from '@/lib/constants/duration'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'
import { dateToPlainDate } from '@/utils/temporal'
import type { ExtensionSpanType } from '../components/ExtensionDurationOrExpiryPicker'
import {
  computeNamePricingDisplay,
  type NamePricingDisplay,
} from '../utils/computeNamePricingDisplay'
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

type RenewalDurationInput = {
  readonly spanType: ExtensionSpanType
  /** Year count in `years` mode, target-expiry timestamp in `date` mode. */
  readonly duration: number
  readonly baseDate?: Temporal.PlainDate
}

export const getLatestRenewalExpiry = (
  selectedNames: readonly SelectedName[],
): Date | null =>
  selectedNames.reduce<Date | null>((max, selectedName) => {
    if (!selectedName.expiryDate) return max
    return !max || selectedName.expiryDate > max ? selectedName.expiryDate : max
  }, null)

export const getRenewalDurationSeconds = ({
  spanType,
  duration,
  baseDate = getStartOfToday(),
}: RenewalDurationInput): number => {
  if (spanType === 'years') {
    return getDurationInSecondsFromYears(duration, baseDate)
  }

  if (!Number.isFinite(duration)) {
    throw new Error('Date mode duration must be a valid timestamp')
  }

  // Wall-clock arithmetic, never an epoch delta: a DST transition inside the
  // span must not add or drop an hour, so a date picked from the calendar is
  // exactly the whole days it looks like. The seconds-of-day tail carries the
  // 6h/yr a contract year has over a calendar one, keeping the year presets
  // priced as whole years.
  const target = Temporal.Instant.fromEpochMilliseconds(
    duration,
  ).toZonedDateTimeISO(Temporal.Now.timeZoneId())
  const days = baseDate.until(target.toPlainDate(), { largestUnit: 'day' }).days
  const secondsOfDay =
    target.hour * SECONDS_PER_HOUR +
    target.minute * SECONDS_PER_MINUTE +
    target.second

  return Math.max(
    days * SECONDS_PER_DAY + secondsOfDay,
    MIN_REGISTRATION_DURATION,
  )
}

export function useMultiNamePricing(
  selectedNames: readonly SelectedName[],
  spanType: ExtensionSpanType,
  duration: number,
): MultiNamePricingResult {
  const renewalInputs = useMemo(
    () =>
      selectedNames.map((selectedName) => ({
        selectedName,
        duration: getRenewalDurationSeconds({
          spanType,
          duration,
          baseDate: selectedName.expiryDate
            ? dateToPlainDate(selectedName.expiryDate)
            : undefined,
        }),
      })),
    [duration, selectedNames, spanType],
  )

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
