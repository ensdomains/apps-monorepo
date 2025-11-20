import { useModal } from '@getpara/react-sdk-lite'
import { Calendar } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { DomainAttributePillVariant } from '@/components/molecules/DomainResultCard/DomainAttributePill'
import { DomainAttributePill } from '@/components/molecules/DomainResultCard/DomainAttributePill'
import { Button } from '@/components/ui/button'
import {
  INITIAL_PRICING_OPTIONS,
  PRICING_DURATIONS,
  sanitizePricingDuration,
} from '@/features/register/constants/pricing'
import { useRhinestoneAccount } from '@/lib/rhinestone/useRhinestoneAccount'
import { getTokenPrices } from '../services/nameChainContractService'
import { DurationSelector } from './CheckAvailability/components/DurationSelector'
import type { PricingDuration, PricingOptions } from './CheckAvailability/types'
import { CreditCardPaymentDrawer, CryptoPaymentDrawer } from './PaymentDrawer'

type PricingQuote = {
  usdc?: number
  dai?: number
}

type PricingQuoteMap = Record<PricingDuration, PricingQuote>

const createEmptyPricingQuoteMap = (): PricingQuoteMap => ({
  1: {},
  2: {},
  3: {},
  4: {},
  5: {},
})

type PricingProps = {
  domainName: string
  duration: number
  isConnected: boolean
  isLoading?: boolean
  onSetDuration: (duration: number) => void
  onSelectPayment: (method: 'crypto' | 'credit-card') => void
  onSelectCrypto: (cryptoId: string) => void
  onConfirmPayment: (
    tokenPrice: bigint,
    selectedToken: string,
    options?: { fast?: boolean },
  ) => void
}

export const Pricing = ({
  domainName,
  duration,
  isConnected,
  isLoading = false,
  onSetDuration,
  onSelectPayment,
  onSelectCrypto,
  onConfirmPayment,
}: PricingProps) => {
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

  // Check if AA is available (Rhinestone SDK provides AA by default)
  const { rhinestoneAccount } = useRhinestoneAccount()
  const isUsingAA = !!rhinestoneAccount

  // Para modal for wallet connection
  const { openModal } = useModal()

  const isPremium = useMemo(() => determinePremium(domainName), [domainName])

  const premiumLabel = useMemo(() => {
    const name = domainName.includes('.')
      ? domainName.slice(0, domainName.lastIndexOf('.'))
      : domainName
    const length = name.length
    if (!length || !isPremium) return null

    const variant: DomainAttributePillVariant =
      length <= 3 ? 'premium-3' : 'premium-4'
    return {
      label: `${length} character premium name`,
      variant,
    } as const
  }, [domainName, isPremium])

  // Use the original base price (before any discounts) for calculations
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

  const expirationDate = useMemo(() => {
    const next = new Date()
    next.setFullYear(next.getFullYear() + selectedDuration)
    return next
  }, [selectedDuration])

  const formattedExpiration = useMemo(
    () =>
      expirationDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    [expirationDate],
  )

  const paddedDuration = useMemo(
    () => selectedDuration.toString().padStart(2, '0'),
    [selectedDuration],
  )

  // Fetch pricing for all durations when domain changes
  useEffect(() => {
    let isCancelled = false

    const fetchPricingOptions = async () => {
      if (!domainName) return

      setIsPricingLoading(true)
      try {
        // Fetch only 1-year price to use as base
        const baseResult = await getTokenPrices(domainName, 1)

        if (isCancelled) return

        if (baseResult.isOk() && baseResult.value.usdc) {
          const basePerYear = parseFloat(baseResult.value.usdc.formatted)
          setBasePricePerYear(basePerYear)

          const updatedOptions: PricingOptions = { ...INITIAL_PRICING_OPTIONS }
          const updatedQuotes: PricingQuoteMap = createEmptyPricingQuoteMap()

          // Calculate prices with client-side discounts
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

  const handleConfirmPayment = (
    tokenPrice: bigint,
    selectedToken: string,
    options?: { fast?: boolean },
  ) => {
    onConfirmPayment(tokenPrice, selectedToken, options)
  }

  const handleSelectDuration = (newDuration: PricingDuration) => {
    setSelectedDuration(newDuration)
    onSetDuration(newDuration)
  }

  const isPriceLoading =
    isPricingLoading ||
    pricingQuotes[selectedDuration]?.usdc === undefined ||
    pricingQuotes[selectedDuration]?.usdc === null

  const handleConnect = async () => {
    try {
      await openModal()
    } catch (error) {
      console.error('Failed to open Para modal:', error)
    }
  }

  return (
    <div className="w-full max-w-[1200px] space-y-6">
      {/* Domain Name Header */}
      <div className="flex flex-col items-center gap-3 md:items-start">
        {isPremium && premiumLabel && (
          <DomainAttributePill
            label={premiumLabel.label}
            variant={premiumLabel.variant}
          />
        )}
        <h1 className="font-semi-mono text-[#4a5c63] text-[48px] leading-none tracking-[-0.96px] md:text-[96px] md:tracking-[-7.68px]">
          {domainName}
        </h1>
      </div>

      {/* Two Column Layout - Desktop / Single Column - Mobile */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-2">
        {/* Left Column: Duration Selector */}
        <div className="flex-1 space-y-2">
          <DurationSelector
            pricing={pricingOptions}
            selectedDuration={selectedDuration}
            onSelect={handleSelectDuration}
            disabled={isPricingLoading || isLoading}
          />
          {isPricingLoading && (
            <div className="text-center">
              <p className="text-slate-500 text-sm">Loading prices...</p>
            </div>
          )}
        </div>

        {/* Right Column: Summary Cards - Desktop / Mobile: Full width */}
        <div className="flex w-full flex-col gap-1 md:w-[453px] md:gap-[9px]">
          {/* Registration Summary Card */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-[#ddddde] bg-white px-0 py-8 md:h-[205px] md:p-6">
            <div className="w-full space-y-6 md:space-y-6">
              <div className="space-y-2 text-center">
                {/* Registering for X years */}
                <div className="flex items-baseline justify-center gap-[6px]">
                  <span className="font-normal text-[20px] text-primary-midnight-blue leading-none tracking-[-0.2px] md:text-[24px] md:tracking-[-0.24px]">
                    Registering for
                  </span>
                  <div className="rounded-sm bg-[rgba(245,245,245,0.5)] px-1 py-[2px]">
                    <span className="font-medium text-[20px] text-brand-blue leading-none tracking-[-0.2px] md:text-[24px] md:tracking-[-0.24px]">
                      {paddedDuration}
                    </span>
                  </div>
                  <span className="font-normal text-[20px] text-primary-midnight-blue leading-none tracking-[-0.2px] md:text-[24px] md:tracking-[-0.24px]">
                    years
                  </span>
                </div>

                {/* Expiring on date */}
                <div className="space-y-[6px]">
                  <span className="font-normal text-[20px] text-primary-midnight-blue leading-none tracking-[-0.2px] md:text-[24px] md:tracking-[-0.24px]">
                    expiring on
                  </span>
                  <div className="inline-flex items-center gap-2 rounded-sm bg-[rgba(245,245,245,0.5)] px-1 py-[2px]">
                    <Calendar className="size-4 text-brand-blue" />
                    <span className="font-medium text-[20px] text-brand-blue leading-none tracking-[-0.2px] md:text-[24px] md:tracking-[-0.24px]">
                      {formattedExpiration}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Total & Payment Card */}
          <div className="space-y-8 rounded-xl border border-[#ddddde] bg-white px-0 py-8 md:space-y-[38px] md:p-8">
            {/* Total Price Section */}
            <div className="flex flex-col justify-center gap-4 text-center md:gap-1">
              <div className="space-y-1">
                <p className="font-normal text-[12px] text-lapis-surface tracking-[0.12px]">
                  TOTAL
                </p>
                {!isPriceLoading &&
                  discountPercentage > 0 &&
                  theoreticalTotal > finalPrice && (
                    <p className="text-[#7d7d7d] text-[16px] tracking-[-0.28px] line-through">
                      ${theoreticalTotal.toFixed(0)} USD
                    </p>
                  )}
                <div className="flex items-end justify-center gap-[6px]">
                  <span className="font-medium font-mono text-[36px] text-primary-midnight-blue leading-none tracking-[0.36px] md:text-[48px] md:tracking-[0.48px]">
                    ${isPriceLoading ? '...' : finalPrice.toFixed(0)}
                  </span>
                  <span className="font-normal text-[16px] text-primary-midnight-blue leading-[27px]">
                    USD
                  </span>
                </div>
              </div>
              {!isPriceLoading &&
                discountPercentage > 0 &&
                discountAmount > 0 && (
                  <div className="mx-auto w-fit rounded bg-[#e7faed] px-4 py-3 md:w-auto">
                    <span className="font-normal text-[#007c23] text-[24px] tracking-[-0.22px]">
                      Save ${discountAmount.toFixed(0)}
                    </span>
                  </div>
                )}
            </div>

            {/* Payment Button */}
            {!isConnected ? (
              <div className="px-5 md:px-0">
                <Button
                  variant="default"
                  className="h-[70px] w-full rounded-[4px] bg-brand-blue hover:bg-brand-blue-hover md:h-[74px]"
                  onClick={handleConnect}
                >
                  <span className="font-medium font-mono text-[13px] text-white uppercase tracking-[1.04px]">
                    Connect or sign in to register
                  </span>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 px-5 md:px-0">
                <CryptoPaymentDrawer
                  domainName={domainName}
                  duration={selectedDuration}
                  priceUSD={isPriceLoading ? 0 : finalPrice}
                  isLoading={isLoading}
                  onPaymentSelect={onSelectPayment}
                  onCryptoSelect={onSelectCrypto}
                  onConfirmPayment={handleConfirmPayment}
                  isUsingAA={isUsingAA}
                />
                <CreditCardPaymentDrawer
                  domainName={domainName}
                  duration={selectedDuration}
                  priceUSD={isPriceLoading ? 0 : finalPrice}
                  onPaymentSelect={onSelectPayment}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function determinePremium(name: string) {
  const normalized = name.trim().toLowerCase()
  const label = normalized.endsWith('.eth')
    ? normalized.replace('.eth', '')
    : normalized
  return label.length > 0 && label.length <= 4
}
