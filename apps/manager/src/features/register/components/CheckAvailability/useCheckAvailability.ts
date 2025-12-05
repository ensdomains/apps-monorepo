import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { PricingOptions } from '@/features/register/components/Pricing/types'
import {
  INITIAL_PRICING_OPTIONS,
  PRICING_DURATIONS,
} from '@/features/register/components/Pricing/utils'
import {
  getNamePricingQueryOptions,
  getSearchNameQueryOptions,
} from '@/features/register/services/checkNameAvailabilityService'
import {
  getPremiumLabel,
  normalizeQuery,
  validateENSName,
} from '@/features/register/utils'

export type DisplayState =
  | { type: 'idle' }
  | { type: 'searching'; domainName: string }
  | { type: 'available'; domainName: string }
  | { type: 'unavailable'; domainName: string }

interface UseCheckAvailabilityParams {
  /** Current input value (for instant validation) */
  inputValue?: string
  /** Debounced input value (for query) */
  debouncedInput?: string
  /** Initial name to auto-search (for registration page) */
  initialName?: string
  /** Whether to auto-search the initial name */
  autoSearch?: boolean
}

export const useCheckAvailability = ({
  inputValue = '',
  debouncedInput = '',
  initialName,
  autoSearch = false,
}: UseCheckAvailabilityParams = {}) => {
  // For auto-search mode (registration page), use initialName for everything
  const effectiveInput = autoSearch && initialName ? initialName : inputValue
  const effectiveDebouncedInput =
    autoSearch && initialName ? initialName : debouncedInput

  const trimmedInput = effectiveInput.trim()
  const trimmedDebouncedInput = effectiveDebouncedInput.trim()

  // Instant validation on current input (not debounced)
  const validation = useMemo(
    () => (trimmedInput ? validateENSName(trimmedInput) : null),
    [trimmedInput],
  )

  // Only normalize debounced input if validation passes
  const normalizedName = useMemo(
    () =>
      !validation && trimmedDebouncedInput
        ? normalizeQuery(trimmedDebouncedInput)
        : null,
    [validation, trimmedDebouncedInput],
  )

  // Is currently debouncing (input changed but debounce hasn't fired yet)
  const isDebouncing =
    trimmedInput !== trimmedDebouncedInput && trimmedInput.length > 0

  // Availability query - only runs if validation passes and we have input
  const availabilityQuery = useQuery({
    ...getSearchNameQueryOptions(normalizedName ?? ''),
    enabled: !!normalizedName && trimmedInput.length >= 3,
  })

  // Pricing query - only runs if name is available
  const pricingQuery = useQuery({
    ...getNamePricingQueryOptions(availabilityQuery.data?.name),
    enabled: availabilityQuery.data?.isAvailable === true,
  })

  // Compute pricing options from query data
  const pricing = useMemo((): PricingOptions => {
    const pricingData = pricingQuery.data
    if (!pricingData?.usdc) return INITIAL_PRICING_OPTIONS

    const basePerYear = parseFloat(pricingData.usdc.formatted)
    const newPricing = { ...INITIAL_PRICING_OPTIONS }

    for (const duration of PRICING_DURATIONS) {
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
    }

    return newPricing
  }, [pricingQuery.data])

  // Derive display state
  const displayState = useMemo((): DisplayState => {
    // No input
    if (!trimmedInput) return { type: 'idle' }

    // Validation error - show idle (error shown separately)
    if (validation) return { type: 'idle' }

    // Loading
    if (availabilityQuery.isFetching && normalizedName) {
      return { type: 'searching', domainName: normalizedName }
    }

    // Has result
    const data = availabilityQuery.data
    if (data && !availabilityQuery.isFetching) {
      // Check if result matches current input
      const inputMatches =
        trimmedInput.toLowerCase() ===
          data.name.replace('.eth', '').toLowerCase() ||
        trimmedInput.toLowerCase() === data.name.toLowerCase()

      if (inputMatches) {
        if (data.isAvailable) {
          return { type: 'available', domainName: data.name }
        }
        return { type: 'unavailable', domainName: data.name }
      }
    }

    return { type: 'idle' }
  }, [
    trimmedInput,
    validation,
    availabilityQuery.isFetching,
    availabilityQuery.data,
    normalizedName,
  ])

  // Premium label
  const premiumLabel = useMemo(
    () =>
      availabilityQuery.data?.name
        ? getPremiumLabel(availabilityQuery.data.name)
        : undefined,
    [availabilityQuery.data?.name],
  )

  // Error message extraction
  const errorMessage = useMemo(() => {
    const err = availabilityQuery.error
    if (!err) return null
    if (err instanceof Error) return err.message
    if (typeof err === 'object' && err !== null && 'message' in err) {
      return String((err as { message: unknown }).message)
    }
    return 'An error occurred'
  }, [availabilityQuery.error])

  // Show loading when debouncing or fetching (but not if there's a validation error)
  const isLoading =
    !validation && (isDebouncing || availabilityQuery.isFetching)

  return {
    validation,
    availabilityQuery,
    pricingQuery,
    pricing,
    displayState,
    premiumLabel,
    selectedName: availabilityQuery.data?.name ?? null,
    isAvailable: availabilityQuery.data?.isAvailable ?? false,
    isSearching: availabilityQuery.isFetching,
    isDebouncing,
    isLoading,
    error: availabilityQuery.error,
    errorMessage,
  }
}
