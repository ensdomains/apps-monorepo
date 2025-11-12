import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import {
  INITIAL_PRICING_OPTIONS,
  PRICING_DURATIONS,
} from '@/features/register/constants/pricing'
import { getTokenPrices } from '@/features/register/services/nameChainContractService'
import { checkNameAvailability } from '@/services/checkNameAvailabilityService'
import type { PricingDuration, PricingOptions } from '../types'

const normalizeQuery = (query: string) => {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return ''
  return trimmed.endsWith('.eth') ? trimmed : `${trimmed}.eth`
}

export const useCheckAvailability = () => {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [isAvailable, setIsAvailable] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [selectedDuration, setSelectedDuration] =
    useState<PricingDuration | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPremium, setIsPremium] = useState(false)
  const [registrationSuccess, setRegistrationSuccess] = useState(false)
  const [pricing, setPricing] = useState<PricingOptions>(
    INITIAL_PRICING_OPTIONS,
  )
  const [isPricingLoading, setIsPricingLoading] = useState(false)

  const searchName = useCallback(async (query: string) => {
    const normalized = normalizeQuery(query)
    if (!normalized) return

    setSearchQuery(normalized)
    setIsSearching(true)
    setError(null)
    setRegistrationSuccess(false)
    setSelectedName('')
    setIsAvailable(false)
    setShowModal(false)
    setSelectedDuration(null)

    try {
      const result = await checkNameAvailability(normalized)

      if (!result.isAvailable && result.error) {
        setError(result.error)
        setSelectedName(normalized)
        setIsAvailable(false)
        // Still show modal to display the error/unavailable state
        setShowModal(true)
      } else {
        setSelectedName(result.name)
        setIsAvailable(result.isAvailable)
        setIsPremium(result.name.length <= 4)
        setError(null)
        // Always open modal to show availability state
        setShowModal(true)
      }
    } catch (err) {
      setSelectedName(normalized)
      setIsAvailable(false)
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to check availability. Please try again.',
      )
      // Show modal even on error to display the error state
      setShowModal(true)
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
        } else {
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

  const openModal = useCallback(() => {
    if (isAvailable) {
      setShowModal(true)
      setError(null)
    }
  }, [isAvailable])

  const closeModal = useCallback(() => {
    setShowModal(false)
  }, [])

  const reset = useCallback(() => {
    setSearchQuery('')
    setSelectedName('')
    setIsAvailable(false)
    setError(null)
    setRegistrationSuccess(false)
    setShowModal(false)
    setIsSearching(false)
    setSelectedDuration(null)
    setPricing(INITIAL_PRICING_OPTIONS)
  }, [])

  return {
    context: {
      searchQuery,
      selectedName,
      isAvailable,
      selectedDuration,
      pricing,
      error,
      isPremium,
      registrationSuccess,
    },
    isSearching,
    isPricingLoading,
    showModal,
    hasResult: Boolean(selectedName),
    canRegister: isAvailable,
    hasError: Boolean(error),
    searchName,
    openModal,
    closeModal,
    reset,
  }
}
