import { useCallback, useEffect, useReducer } from 'react'
import {
  checkAvailabilityReducer,
  initialState,
} from '@/features/register/components/CheckAvailability/checkAvailability.reducer'
import type {
  PricingDuration,
  PricingOptions,
} from '@/features/register/components/Pricing/types'
import {
  INITIAL_PRICING_OPTIONS,
  PRICING_DURATIONS,
} from '@/features/register/components/Pricing/utils'
import { getTokenPrices } from '@/features/register/services/nameChainContractService'
import { normalizeQuery, validateENSName } from '@/features/register/utils'
import { checkNameAvailability } from '@/services/checkNameAvailabilityService'

export const useCheckAvailability = () => {
  const [state, dispatch] = useReducer(checkAvailabilityReducer, initialState)

  const clearValidationError = useCallback(() => {
    dispatch({ type: 'CLEAR_VALIDATION' })
  }, [])

  const resetSearch = useCallback(() => {
    dispatch({ type: 'RESET_SEARCH' })
  }, [])

  const searchName = useCallback(async (query: string) => {
    const validation = validateENSName(query)

    if (validation) {
      dispatch({
        type: 'VALIDATION_ERROR',
        payload: { error: validation, query },
      })
      return
    }

    const normalized = normalizeQuery(query)
    if (!normalized) {
      dispatch({ type: 'RESET_SEARCH' })
      return
    }

    // Start the actual search
    dispatch({ type: 'SEARCH_START', payload: { query: normalized } })

    try {
      const result = await checkNameAvailability(normalized)

      if (!result.isAvailable && result.error) {
        dispatch({
          type: 'SEARCH_ERROR',
          payload: { error: result.error, name: normalized },
        })
      } else {
        dispatch({
          type: 'SEARCH_SUCCESS',
          payload: { name: result.name, isAvailable: result.isAvailable },
        })
      }
    } catch (err) {
      dispatch({
        type: 'SEARCH_ERROR',
        payload: {
          error:
            err instanceof Error
              ? err.message
              : 'Unable to check availability. Please try again.',
          name: normalized,
        },
      })
    }
  }, [])

  useEffect(() => {
    const fetchPrices = async () => {
      if (!state.search.selectedName || !state.search.isAvailable) return

      dispatch({ type: 'PRICING_START' })

      try {
        const baseResult = await getTokenPrices(state.search.selectedName, 1)

        if (baseResult.isOk() && baseResult.value.usdc) {
          const basePerYear = parseFloat(baseResult.value.usdc.formatted)

          const newPricing: PricingOptions = { ...INITIAL_PRICING_OPTIONS }
          PRICING_DURATIONS.forEach((duration: PricingDuration) => {
            const discount = INITIAL_PRICING_OPTIONS[duration].discount
            const discountMultiplier = 1 - discount / 100
            const perYearPrice = basePerYear * discountMultiplier
            const totalPrice = perYearPrice * duration

            newPricing[duration] = {
              ...INITIAL_PRICING_OPTIONS[duration],
              price: perYearPrice,
              discount,
              total: totalPrice,
            }
          })

          dispatch({
            type: 'PRICING_SUCCESS',
            payload: { pricing: newPricing },
          })
        } else if (baseResult.isErr()) {
          console.error('Failed to fetch base price:', baseResult.error)
          dispatch({ type: 'PRICING_END' })
        }
      } catch (error) {
        console.error('Failed to fetch pricing:', error)
        dispatch({ type: 'PRICING_END' })
      }
    }

    fetchPrices()
  }, [state.search.selectedName, state.search.isAvailable])

  return {
    context: {
      searchQuery: state.search.searchQuery,
      selectedName: state.search.selectedName,
      isAvailable: state.search.isAvailable,
      pricing: state.pricing.pricing,
      error: state.search.error,
      validationError: state.search.validationError,
      premiumLabel: state.search.premiumLabel,
      registrationSuccess: state.search.registrationSuccess,
    },
    isSearching: state.isSearching,
    isPricingLoading: state.pricing.isPricingLoading,
    hasResult: Boolean(state.search.selectedName),
    hasError: Boolean(state.search.error),
    hasValidationError: Boolean(state.search.validationError),
    searchName,
    resetSearch,
    clearValidationError,
  }
}
