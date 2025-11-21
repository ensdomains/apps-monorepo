import { useModal } from '@getpara/react-sdk-lite'
import { useEffect, useMemo, useState } from 'react'
import { determinePremium } from '@/features/register/utils'
import { useRhinestoneAccount } from '@/lib/rhinestone/useRhinestoneAccount'
import { getTokenPrices } from '../../services/nameChainContractService'
import type {
  PricingDuration,
  PricingOptions,
} from '../CheckAvailability/types'
import type { PremiumLabel, PricingProps, PricingQuoteMap } from './types'
import {
  calculateExpirationDate,
  createEmptyPricingQuoteMap,
  formatDuration,
  formatExpirationDate,
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
  // ==================== STATE ====================
  const [pricingOptions, setPricingOptions] = useState<PricingOptions>(
    INITIAL_PRICING_OPTIONS,
  )
  const [selectedDuration, setSelectedDuration] = useState<PricingDuration>(
    sanitizePricingDuration(duration),
  )
  const [isPricingLoading, setIsPricingLoading] = useState(false)
  const [pricingQuotes, setPricingQuotes] = useState<PricingQuoteMap>(
    createEmptyPricingQuoteMap,
  )
  const [basePricePerYear, setBasePricePerYear] = useState<number | null>(null)

  // ==================== EXTERNAL HOOKS ====================
  const { rhinestoneAccount } = useRhinestoneAccount()
  const { openModal } = useModal()

  // ==================== COMPUTED VALUES ====================

  // Premium detection
  const isPremium = useMemo(() => determinePremium(domainName), [domainName])

  const premiumLabel = useMemo((): PremiumLabel | null => {
    const name = domainName.includes('.')
      ? domainName.slice(0, domainName.lastIndexOf('.'))
      : domainName
    const length = name.length
    if (!length || !isPremium) return null

    const variant = length <= 3 ? 'premium-3' : 'premium-4'
    return {
      label: `${length} character premium name`,
      variant,
    } as const
  }, [domainName, isPremium])

  // Price calculations
  const basePerYear = basePricePerYear ?? 0
  const selectedOption = pricingOptions[selectedDuration]
  const selectedQuote = pricingQuotes[selectedDuration]
  const fallbackTotal =
    selectedOption?.total ??
    (selectedOption ? selectedOption.price * selectedDuration : 0)
  const finalPrice = selectedQuote?.usdc ?? fallbackTotal
  const theoreticalTotal = basePerYear > 0 ? basePerYear * selectedDuration : 0
  const discountAmount =
    finalPrice && theoreticalTotal > 0
      ? Math.max(0, theoreticalTotal - finalPrice)
      : 0
  const discountPercentage =
    theoreticalTotal > 0 && finalPrice
      ? Math.max(0, Math.round((discountAmount / theoreticalTotal) * 100))
      : (selectedOption?.discount ?? 0)

  // Date formatting
  const expirationDate = useMemo(
    () => calculateExpirationDate(selectedDuration),
    [selectedDuration],
  )

  const formattedExpiration = useMemo(
    () => formatExpirationDate(expirationDate),
    [expirationDate],
  )

  const paddedDuration = useMemo(
    () => formatDuration(selectedDuration),
    [selectedDuration],
  )

  // Loading state
  const isPriceLoading =
    isPricingLoading ||
    pricingQuotes[selectedDuration]?.usdc === undefined ||
    pricingQuotes[selectedDuration]?.usdc === null

  // Account Abstraction availability
  const isUsingAA = !!rhinestoneAccount

  // ==================== EFFECTS ====================

  // Fetch pricing for all durations when domain changes
  useEffect(() => {
    let isCancelled = false

    const fetchPricingOptions = async () => {
      if (!domainName) return

      setIsPricingLoading(true)
      try {
        const baseResult = await getTokenPrices(domainName, 1)

        if (isCancelled) return

        if (baseResult.isOk() && baseResult.value.usdc) {
          const basePerYear = parseFloat(baseResult.value.usdc.formatted)
          setBasePricePerYear(basePerYear)

          const updatedOptions: PricingOptions = { ...INITIAL_PRICING_OPTIONS }
          const updatedQuotes: PricingQuoteMap = createEmptyPricingQuoteMap()

          // TODO: Calculate prices with client-side discounts, I guess will be handle by the contract
          PRICING_DURATIONS.forEach((duration) => {
            const discount = INITIAL_PRICING_OPTIONS[duration].discount
            const discountMultiplier = 1 - discount / 100
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

          setPricingOptions(updatedOptions)
          setPricingQuotes(updatedQuotes)
        } else {
          setBasePricePerYear(null)
          setPricingOptions(INITIAL_PRICING_OPTIONS)
          setPricingQuotes(createEmptyPricingQuoteMap())
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to get pricing options:', error)
          setPricingOptions(INITIAL_PRICING_OPTIONS)
          setBasePricePerYear(null)
          setPricingQuotes(createEmptyPricingQuoteMap())
        }
      } finally {
        if (!isCancelled) {
          setIsPricingLoading(false)
        }
      }
    }

    fetchPricingOptions()

    return () => {
      isCancelled = true
    }
  }, [domainName])

  // ==================== HANDLERS ====================

  const handleSelectDuration = (newDuration: PricingDuration) => {
    setSelectedDuration(newDuration)
    onSetDuration(newDuration)
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

  // ==================== RETURN ====================
  return {
    // State
    pricingOptions,
    selectedDuration,
    isPricingLoading,
    isPriceLoading,
    pricingQuotes,

    // Calculated values
    isPremium,
    premiumLabel,
    finalPrice,
    discountAmount,
    discountPercentage,
    theoreticalTotal,
    formattedExpiration,
    paddedDuration,

    // Account/connection
    isUsingAA,

    // Handlers
    handleSelectDuration,
    handleConfirmPayment,
    handleConnect,
    onSelectPayment,
    onSelectCrypto,
  }
}
