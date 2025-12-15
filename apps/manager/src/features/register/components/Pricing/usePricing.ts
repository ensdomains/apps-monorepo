import { useModal } from '@getpara/react-sdk-lite'
import { useEffect, useMemo, useReducer } from 'react'
import type { PricingDuration } from '@/features/register/components/Pricing/types'
import { getPremiumLabel } from '@/features/register/utils'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { useSmartAccount } from '@/lib/smart-account'
import { getTokenPrices } from '../../services/nameChainContractService'
import { createInitialStateFactory, pricingReducer } from './pricing.reducer'
import type { PricingProps } from './types'
import {
  calculateDurationFromDate,
  calculateExpirationDate,
  createEmptyPricingQuoteMap,
  formatDuration,
  formatExpirationDate,
  INITIAL_PRICING_OPTIONS,
  PRICING_DURATIONS,
  PRICING_YEAR_DISCOUNTS,
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
  // Use HCA config to match registration page
  const { client: smartAccountClient } = useSmartAccount({
    type: 'pimlico',
    accountType: 'hca',
  })
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

  const premiumLabel = useMemo(() => getPremiumLabel(domainName), [domainName])

  const basePerYear = state.basePricePerYear ?? 0
  const isCustomDuration = state.selectedDuration > 5
  const selectedOption = !isCustomDuration
    ? state.pricingOptions[state.selectedDuration as PricingDuration]
    : undefined
  const selectedQuote = !isCustomDuration
    ? state.pricingQuotes[state.selectedDuration as PricingDuration]
    : undefined

  const bestDiscountMultiplier = discountsEnabled
    ? 1 - (PRICING_YEAR_DISCOUNTS[5] ?? 0) / 100
    : 1
  const customDurationPrice =
    isCustomDuration && basePerYear > 0
      ? basePerYear * state.selectedDuration * bestDiscountMultiplier
      : 0

  const fallbackTotal = isCustomDuration
    ? customDurationPrice
    : (selectedOption?.total ??
      (selectedOption
        ? selectedOption.price * state.selectedDuration
        : basePerYear * state.selectedDuration))

  const finalPrice = isCustomDuration
    ? customDurationPrice
    : (selectedQuote?.usdc ?? fallbackTotal)

  const theoreticalTotal =
    basePerYear > 0 ? basePerYear * state.selectedDuration : 0
  const discountAmount = discountsEnabled
    ? finalPrice && theoreticalTotal > 0
      ? Math.max(0, theoreticalTotal - finalPrice)
      : 0
    : 0
  const bestDiscount = discountsEnabled ? (PRICING_YEAR_DISCOUNTS[5] ?? 0) : 0
  const discountPercentage = discountsEnabled
    ? theoreticalTotal > 0 && finalPrice
      ? Math.max(0, Math.round((discountAmount / theoreticalTotal) * 100))
      : (selectedOption?.discount ?? (isCustomDuration ? bestDiscount : 0))
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

  const isPriceLoading = isCustomDuration
    ? state.isPricingLoading || state.basePricePerYear === null
    : state.isPricingLoading ||
      state.pricingQuotes[state.selectedDuration as PricingDuration]?.usdc ===
        undefined ||
      state.pricingQuotes[state.selectedDuration as PricingDuration]?.usdc ===
        null

  const isUsingAA = !!smartAccountClient

  useEffect(() => {
    let isCancelled = false

    const fetchPricingOptions = async () => {
      if (!domainName) return

      dispatch({ type: 'FETCH_PRICING_START' })
      try {
        const baseResult = await getTokenPrices(domainName, 1)

        if (isCancelled) return

        if (baseResult.isOk() && baseResult.value.usdc) {
          const basePerYear = parseFloat(baseResult.value.usdc.formatted)
          const updatedOptions = { ...INITIAL_PRICING_OPTIONS }
          const updatedQuotes = createEmptyPricingQuoteMap()

          PRICING_DURATIONS.forEach((duration: PricingDuration) => {
            const discount = discountsEnabled
              ? INITIAL_PRICING_OPTIONS[duration].discount
              : 0
            const discountMultiplier = discountsEnabled ? 1 - discount / 100 : 1
            const perYearPrice = basePerYear * discountMultiplier
            const totalPrice = perYearPrice * duration

            updatedOptions[duration] = {
              ...INITIAL_PRICING_OPTIONS[duration],
              price: perYearPrice,
              discount,
              total: totalPrice,
            }

            updatedQuotes[duration] = {
              usdc: totalPrice,
              dai: baseResult.value.dai
                ? parseFloat(baseResult.value.dai.formatted) *
                  discountMultiplier *
                  duration
                : undefined,
            }
          })

          if (!isCancelled) {
            dispatch({
              type: 'FETCH_PRICING_SUCCESS',
              payload: {
                basePricePerYear: basePerYear,
                pricingOptions: updatedOptions,
                pricingQuotes: updatedQuotes,
              },
            })
          }
        } else {
          if (!isCancelled) {
            dispatch({ type: 'FETCH_PRICING_ERROR' })
          }
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to get pricing options:', error)
          dispatch({ type: 'FETCH_PRICING_ERROR' })
        }
      }
    }

    fetchPricingOptions()

    return () => {
      isCancelled = true
    }
  }, [domainName, discountsEnabled])

  const handleChange = (input: Date | number | undefined) => {
    if (input === undefined) {
      dispatch({ type: 'SET_DATE', payload: null })
      return
    }

    if (input instanceof Date) {
      dispatch({ type: 'SET_DATE', payload: input })
      const calculatedDuration = calculateDurationFromDate(input)
      onSetDuration(calculatedDuration)
    } else {
      dispatch({ type: 'SET_DURATION', payload: input })
      onSetDuration(input)
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
    pricingOptions: state.pricingOptions,
    selectedDuration: state.selectedDuration,
    isPricingLoading: state.isPricingLoading,
    isPriceLoading,
    pricingQuotes: state.pricingQuotes,
    premiumLabel,
    finalPrice,
    discountAmount,
    discountPercentage,
    theoreticalTotal,
    formattedExpiration,
    paddedDuration,
    expirationDate,
    isUsingAA,
    handleChange,
    handleConfirmPayment,
    handleConnect,
    onSelectPayment,
    onSelectCrypto,
  }
}
