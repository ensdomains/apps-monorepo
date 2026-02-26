import { useModal } from '@getpara/react-sdk-lite'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useReducer, useState } from 'react'
import type { PricingDuration } from '@/features/register/components/Pricing/types'
import { getPremiumLabel } from '@/features/register/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { useSmartAccountContext } from '@/lib/smart-account'
import { getTokenPrices } from '../../services/nameChainContractService'
import { createInitialStateFactory, pricingReducer } from './pricing.reducer'
import type { PricingProps } from './types'
import {
  calculateDurationFromDate,
  calculateExpirationDate,
  createEmptyPricingQuoteMap,
  formatDuration,
  formatExpirationDate,
  formatYears,
  INITIAL_PRICING_OPTIONS,
  PRICING_DURATIONS,
  sanitizePricingDuration,
} from './utils'

export const usePricing = ({
  domainName,
  duration,
  onSetDuration,
  onSelectPayment,
  onSelectCrypto,
  onConfirmPayment,
}: Pick<
  PricingProps,
  | 'domainName'
  | 'duration'
  | 'onSetDuration'
  | 'onSelectPayment'
  | 'onSelectCrypto'
  | 'onConfirmPayment'
>) => {
  const { client: smartAccountClient } = useSmartAccountContext()
  const { openModal } = useModal()
  const discountsEnabled = useFeatureFlag('DISCOUNTS_APPLIED')

  const createInitialState = useMemo(
    () => createInitialStateFactory(discountsEnabled),
    [discountsEnabled],
  )

  const [state, dispatch] = useReducer(
    pricingReducer,
    sanitizePricingDuration(duration),
    createInitialState,
  )

  // Shared input value for duration inputs across components
  const [durationInputValue, setDurationInputValue] = useState<string>(
    formatDuration(state.selectedDuration),
  )

  const premiumLabel = useMemo(() => getPremiumLabel(domainName), [domainName])

  const isCustomDuration = !PRICING_DURATIONS.includes(
    state.selectedDuration as PricingDuration,
  )

  const isUsingAA = !!smartAccountClient

  // Fetch base pricing for preset durations
  const presetPricingQuery = useQuery({
    queryKey: ['pricing', 'presets', domainName, discountsEnabled],
    queryFn: async () => {
      const baseResult = await getTokenPrices(domainName, 1)

      if (baseResult.isErr() || !baseResult.value.usdc) {
        throw new Error('Failed to fetch base pricing')
      }

      const basePerYear = parseFloat(baseResult.value.usdc.formatted)
      const updatedOptions = { ...INITIAL_PRICING_OPTIONS }
      const updatedQuotes = createEmptyPricingQuoteMap()

      for (const dur of PRICING_DURATIONS) {
        const discount = discountsEnabled
          ? INITIAL_PRICING_OPTIONS[dur].discount
          : 0
        const discountMultiplier = discountsEnabled ? 1 - discount / 100 : 1
        const perYearPrice = basePerYear * discountMultiplier
        const totalPrice = Math.ceil(perYearPrice * dur)

        updatedOptions[dur] = {
          ...INITIAL_PRICING_OPTIONS[dur],
          price: perYearPrice,
          discount,
          total: totalPrice,
        }

        updatedQuotes[dur] = {
          usdc: totalPrice,
          dai: baseResult.value.dai
            ? Math.ceil(
                parseFloat(baseResult.value.dai.formatted) *
                  discountMultiplier *
                  dur,
              )
            : undefined,
        }
      }

      return {
        basePricePerYear: basePerYear,
        pricingOptions: updatedOptions,
        pricingQuotes: updatedQuotes,
      }
    },
    enabled: !!domainName,
  })

  // Debounce custom duration for contract price lookup
  const { debouncedValue: debouncedCustomDuration } = useDebounce(
    isCustomDuration ? state.selectedDuration : null,
    { delay: 300 },
  )

  // Fetch real contract price for custom durations
  const customQuoteQuery = useQuery({
    queryKey: ['pricing', 'customQuote', domainName, debouncedCustomDuration],
    queryFn: async () => {
      const result = await getTokenPrices(domainName, debouncedCustomDuration!)

      if (result.isErr()) {
        throw new Error('Failed to fetch custom quote')
      }

      return {
        usdc: result.value.usdc
          ? Math.ceil(parseFloat(result.value.usdc.formatted))
          : undefined,
        dai: result.value.dai
          ? Math.ceil(parseFloat(result.value.dai.formatted))
          : undefined,
      }
    },
    enabled: !!domainName && debouncedCustomDuration != null,
  })

  // Derive pricing data directly from query results
  const pricingOptions =
    presetPricingQuery.data?.pricingOptions ?? INITIAL_PRICING_OPTIONS
  const presetQuotes =
    presetPricingQuery.data?.pricingQuotes ?? createEmptyPricingQuoteMap()
  const basePerYear = presetPricingQuery.data?.basePricePerYear ?? 0

  const selectedOption = isCustomDuration
    ? undefined
    : pricingOptions[state.selectedDuration as PricingDuration]

  const selectedQuote = isCustomDuration
    ? customQuoteQuery.data
    : presetQuotes[state.selectedDuration as PricingDuration]

  const customDurationPrice =
    isCustomDuration && basePerYear > 0
      ? Math.ceil(basePerYear * state.selectedDuration)
      : 0

  const fallbackTotal = isCustomDuration
    ? customDurationPrice
    : (selectedOption?.total ??
      (selectedOption
        ? Math.ceil(selectedOption.price * state.selectedDuration)
        : Math.ceil(basePerYear * state.selectedDuration)))

  const finalPrice = selectedQuote?.usdc ?? fallbackTotal

  const theoreticalTotal =
    basePerYear > 0 ? basePerYear * state.selectedDuration : 0
  const discountAmount = discountsEnabled
    ? finalPrice && theoreticalTotal > 0
      ? Math.max(0, theoreticalTotal - finalPrice)
      : 0
    : 0
  const discountPercentage = discountsEnabled
    ? theoreticalTotal > 0 && finalPrice
      ? Math.max(0, Math.round((discountAmount / theoreticalTotal) * 100))
      : (selectedOption?.discount ?? 0)
    : 0

  const expirationDate = useMemo(() => {
    if (state.selectedExpirationDate) {
      return state.selectedExpirationDate
    }
    return calculateExpirationDate(state.selectedDuration)
  }, [state.selectedDuration, state.selectedExpirationDate])

  const formattedExpiration = useMemo(
    () => formatExpirationDate(expirationDate),
    [expirationDate],
  )

  const paddedDuration = useMemo(
    () => formatDuration(state.selectedDuration),
    [state.selectedDuration],
  )

  const isPriceLoading =
    presetPricingQuery.isPending ||
    (isCustomDuration && customQuoteQuery.isFetching) ||
    selectedQuote?.usdc == null

  const handleChange = (input: Date | number | undefined) => {
    if (input === undefined) {
      dispatch({ type: 'SET_DATE', payload: null })
      return
    }

    if (input instanceof Date) {
      dispatch({ type: 'SET_DATE', payload: input })
      const calculatedDuration = calculateDurationFromDate(input)
      setDurationInputValue(formatYears(calculatedDuration))
      onSetDuration(calculatedDuration)
    } else {
      const normalizedDuration = sanitizePricingDuration(input)
      dispatch({ type: 'SET_DURATION', payload: normalizedDuration })
      setDurationInputValue(formatYears(normalizedDuration))
      onSetDuration(normalizedDuration)
    }
  }

  const handleConfirmPayment = (
    tokenPrice: bigint,
    selectedToken: string,
    options?: { fast?: boolean },
  ) => {
    onConfirmPayment(tokenPrice, selectedToken, options)
  }

  const handleConnect = async () => {
    try {
      await openModal()
    } catch (error) {
      console.error('Failed to open Para modal:', error)
    }
  }

  return {
    pricingOptions,
    selectedDuration: state.selectedDuration,
    isPricingLoading: presetPricingQuery.isPending,
    isPriceLoading,
    pricingQuotes: presetQuotes,
    premiumLabel,
    finalPrice,
    discountAmount,
    discountPercentage,
    theoreticalTotal,
    formattedExpiration,
    paddedDuration,
    expirationDate,
    isUsingAA,
    durationInputValue,
    setDurationInputValue,
    handleChange,
    handleConfirmPayment,
    handleConnect,
    onSelectPayment,
    onSelectCrypto,
  }
}
