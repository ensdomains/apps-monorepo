import { useCallback, useEffect, useState } from 'react'
import {
  INITIAL_PRICING_OPTIONS,
  PRICING_DURATIONS,
} from '@/features/register/constants/pricing'
import { getTokenPrices } from '@/features/register/services/nameChainContractService'
import { checkNameAvailability } from '@/services/checkNameAvailabilityService'
import type { PricingOptions } from '../types'

export type ValidationError =
  | { type: 'INVALID_CHARACTER'; message: string }
  | { type: 'TOO_SHORT'; message: string }
  | { type: 'INVALID_FORMAT'; message: string }
  | null

const normalizeQuery = (query: string) => {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return ''
  return trimmed.endsWith('.eth') ? trimmed : `${trimmed}.eth`
}

const determinePremium = (name: string): boolean => {
  const normalized = name.trim().toLowerCase()
  const label = normalized.endsWith('.eth')
    ? normalized.replace('.eth', '')
    : normalized
  return label.length > 0 && label.length <= 4
}

/**
 * Validates an ENS domain name and returns a validation error if invalid.
 * Based on ENS naming rules:
 * - Minimum 3 characters for the label (excluding .eth)
 * - Allowed: letters, numbers, hyphens, emojis
 * - Not allowed: spaces, special characters like &, *, etc.
 * - No multiple consecutive dots
 */
const validateENSName = (name: string): ValidationError => {
  const trimmed = name.trim()

  if (!trimmed) {
    return null // Empty input is handled separately
  }

  // Extract the label (part before .eth)
  const hasEthSuffix = trimmed.toLowerCase().endsWith('.eth')
  const label = hasEthSuffix ? trimmed.slice(0, -4).trim() : trimmed.trim()

  // Check for spaces anywhere in the input (format error)
  if (trimmed.includes(' ')) {
    return {
      type: 'INVALID_FORMAT',
      message:
        "Not a valid name format. Something in the name isn't supported. Try letters, numbers, hyphens, or emojis with no spaces.",
    }
  }

  // Check for multiple consecutive dots anywhere in the input (format error)
  if (trimmed.includes('..')) {
    return {
      type: 'INVALID_FORMAT',
      message:
        "Not a valid name format. Something in the name isn't supported. Try letters, numbers, hyphens, or emojis with no spaces.",
    }
  }

  // Check for dots in the label itself (should not have dots in the middle)
  if (label.includes('.')) {
    return {
      type: 'INVALID_FORMAT',
      message:
        "Not a valid name format. Something in the name isn't supported. Try letters, numbers, hyphens, or emojis with no spaces.",
    }
  }

  // Check minimum length (3 characters for the label)
  if (label.length > 0 && label.length < 3) {
    return {
      type: 'TOO_SHORT',
      message: 'Too short. Names must be 3 characters or more to register.',
    }
  }

  // Check for invalid characters in the label
  // Allow: letters (a-z, A-Z), numbers (0-9), hyphens (-), and emojis/Unicode
  // Invalid characters include: &, *, @, #, $, %, ^, etc.
  // We'll check for specific invalid ASCII characters explicitly
  const invalidAsciiChars = /[&*@#$%^()[\]{}|\\:;"'<>?,=+~`!]/

  // Check if there are any invalid ASCII characters
  if (label.length > 0 && invalidAsciiChars.test(label)) {
    return {
      type: 'INVALID_CHARACTER',
      message:
        "Invalid character. That character isn't supported. Try letters, numbers, hyphens, or emojis.",
    }
  }

  return null
}

export const useCheckAvailability = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [isAvailable, setIsAvailable] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<ValidationError>(null)
  const [isPremium, setIsPremium] = useState(false)
  const [registrationSuccess, setRegistrationSuccess] = useState(false)
  const [pricing, setPricing] = useState<PricingOptions>(
    INITIAL_PRICING_OPTIONS,
  )
  const [isPricingLoading, setIsPricingLoading] = useState(false)

  // Function to clear validation errors (e.g., when user starts typing)
  const clearValidationError = useCallback(() => {
    setValidationError(null)
  }, [])

  const searchName = useCallback(async (query: string) => {
    // Validate the input before processing
    const validation = validateENSName(query)

    if (validation) {
      // If validation fails, set the validation error and don't search
      setValidationError(validation)
      setError(null)
      setSearchQuery(query)
      setSelectedName('')
      setIsAvailable(false)
      setIsSearching(false)
      return
    }

    // Clear validation error if validation passes
    setValidationError(null)

    const normalized = normalizeQuery(query)
    if (!normalized) {
      setValidationError(null)
      setError(null)
      setSearchQuery('')
      setSelectedName('')
      setIsAvailable(false)
      return
    }

    setSearchQuery(normalized)
    setIsSearching(true)
    setError(null)
    setRegistrationSuccess(false)
    setSelectedName('')
    setIsAvailable(false)

    try {
      const result = await checkNameAvailability(normalized)

      if (!result.isAvailable && result.error) {
        setError(result.error)
        setSelectedName(normalized)
        setIsAvailable(false)
        setIsPremium(determinePremium(normalized))
      } else {
        setSelectedName(result.name)
        setIsAvailable(result.isAvailable)
        setIsPremium(determinePremium(result.name))
        setError(null)
      }
    } catch (err) {
      setSelectedName(normalized)
      setIsAvailable(false)
      setIsPremium(determinePremium(normalized))
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to check availability. Please try again.',
      )
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Fetch real prices when name is available
  useEffect(() => {
    const fetchPrices = async () => {
      if (!selectedName || !isAvailable) return

      setIsPricingLoading(true)
      try {
        // Fetch only 1-year price to use as base
        const baseResult = await getTokenPrices(selectedName, 1)

        if (baseResult.isOk() && baseResult.value.usdc) {
          const basePerYear = parseFloat(baseResult.value.usdc.formatted)

          // Calculate prices with client-side discounts
          const newPricing: PricingOptions = { ...INITIAL_PRICING_OPTIONS }
          PRICING_DURATIONS.forEach((duration) => {
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

          setPricing(newPricing)
        } else if (baseResult.isErr()) {
          console.error('Failed to fetch base price:', baseResult.error)
        }
      } catch (error) {
        console.error('Failed to fetch pricing:', error)
      } finally {
        setIsPricingLoading(false)
      }
    }

    fetchPrices()
  }, [selectedName, isAvailable])

  return {
    context: {
      searchQuery,
      selectedName,
      isAvailable,
      pricing,
      error,
      validationError,
      isPremium,
      registrationSuccess,
    },
    isSearching,
    isPricingLoading,
    hasResult: Boolean(selectedName),
    hasError: Boolean(error),
    hasValidationError: Boolean(validationError),
    searchName,
    clearValidationError,
  }
}
