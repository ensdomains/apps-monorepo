import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  INITIAL_PRICING_OPTIONS,
  PRICING_DURATIONS,
  sanitizePricingDuration,
} from '@/features/register/constants/pricing'
import { useRhinestoneAccount } from '@/lib/rhinestone/useRhinestoneAccount'
import { cn } from '@/lib/utils'
import { getTokenPrices } from '../services/nameChainContractService'
import { DurationSelector } from './CheckAvailability/components/DurationSelector'
import type { PricingDuration, PricingOptions } from './CheckAvailability/types'
import { CreditCardPaymentDrawer, CryptoPaymentDrawer } from './PaymentDrawer'
import { RegistrationSummaryCard } from './RegistrationSummaryCard'

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
  onConfirmPayment: (tokenPrice: bigint, selectedToken: string) => void
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

  const isPremium = useMemo(() => determinePremium(domainName), [domainName])

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

  // Fetch pricing for all durations when domain or connection changes
  useEffect(() => {
    let isCancelled = false

    const fetchPricingOptions = async () => {
      if (!domainName || !isConnected) return

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
  }, [domainName, isConnected])

  const handleConfirmPayment = (tokenPrice: bigint, selectedToken: string) => {
    onConfirmPayment(tokenPrice, selectedToken)
  }

  const handleSelectDuration = (newDuration: PricingDuration) => {
    setSelectedDuration(newDuration)
    onSetDuration(newDuration)
  }

  const isPriceLoading =
    isPricingLoading ||
    pricingQuotes[selectedDuration]?.usdc === undefined ||
    pricingQuotes[selectedDuration]?.usdc === null
  const finalDaiPrice = pricingQuotes[selectedDuration]?.dai

  const header = (
    <div className="space-y-4 text-center">
      <h2 className="font-semibold text-3xl text-slate-900">
        Choose registration length
      </h2>
      <div className="flex items-center justify-center gap-3">
        <span className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-lg text-slate-900">
          {domainName}
        </span>
        {isPremium && (
          <span className="rounded-full bg-slate-200 px-3 py-1 font-medium text-slate-600 text-xs uppercase tracking-wide">
            Premium name
          </span>
        )}
      </div>
    </div>
  )

  return (
    <RegistrationSummaryCard
      header={header}
      footer={
        !isConnected ? (
          <Button className="h-12 w-full font-semibold text-base">
            Connect Wallet to Register
          </Button>
        ) : (
          <div className="flex flex-col gap-3 md:flex-row md:gap-4">
            <CreditCardPaymentDrawer
              domainName={domainName}
              duration={selectedDuration}
              priceUSD={isPriceLoading ? 0 : finalPrice}
              onPaymentSelect={onSelectPayment}
            />
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
          </div>
        )
      }
    >
      <div className="space-y-6">
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

      <div
        className={cn(
          'rounded-lg border border-slate-200 bg-white p-6',
          'space-y-4',
        )}
      >
        <div className={cn('flex flex-col items-center text-center', 'gap-2')}>
          <span className="text-slate-500 text-sm">Total in USD</span>
          {!isPriceLoading &&
            discountPercentage > 0 &&
            theoreticalTotal > finalPrice && (
              <div className="text-slate-400 text-sm">
                <span className="line-through">
                  ${theoreticalTotal.toFixed(2)} USD
                </span>
              </div>
            )}
          <div className="font-semibold text-3xl text-slate-900">
            ${isPriceLoading ? '...' : finalPrice.toFixed(2)}
          </div>
          {!isPriceLoading && finalDaiPrice !== undefined && (
            <div className="text-slate-500 text-sm">
              {finalPrice.toFixed(2)} USDC or {finalDaiPrice.toFixed(2)} DAI
            </div>
          )}
          {!isPriceLoading && discountPercentage > 0 && discountAmount > 0 && (
            <span className="font-medium text-emerald-600 text-sm">
              Save ${discountAmount.toFixed(2)} ({discountPercentage}% off)
            </span>
          )}
        </div>

        <div className="rounded-md bg-slate-100 px-4 py-3 text-center text-slate-600 text-sm">
          Registering for {paddedDuration} year
          {selectedDuration > 1 ? 's' : ''} • Expiring on{' '}
          <span className="font-medium text-slate-900">
            {formattedExpiration}
          </span>
        </div>
      </div>
    </RegistrationSummaryCard>
  )
}

function determinePremium(name: string) {
  const normalized = name.trim().toLowerCase()
  const label = normalized.endsWith('.eth')
    ? normalized.replace('.eth', '')
    : normalized
  return label.length > 0 && label.length <= 4
}
