import * as React from 'react'
import { DurationSelector } from '@/features/register/components/CheckAvailability/DurationSelector'
import { PricingDomainHeader } from '@/features/register/components/Pricing/PricingDomainHeader'
import { PricingPaymentSection } from '@/features/register/components/Pricing/PricingPaymentSection'
import { PricingRegistrationSummaryCard } from '@/features/register/components/Pricing/PricingRegistrationSummaryCard'
import { PricingTotalPriceCard } from '@/features/register/components/Pricing/PricingTotalPriceCard'
import type {
  PricingDuration,
  PricingProps,
} from '@/features/register/components/Pricing/types'
import { usePricing } from '@/features/register/components/Pricing/usePricing'

export const Pricing = ({
  domainName,
  duration,
  isConnected,
  isLoading = false,
  onSetDuration,
  onSelectPayment,
  onSelectCrypto,
  onConfirmPayment,
  onPricingDataChange,
}: PricingProps) => {
  const {
    // State
    pricingOptions,
    selectedDuration,
    isPricingLoading,
    isPriceLoading,

    // Calculated values
    premiumLabel,
    finalPrice,
    discountAmount,
    discountPercentage,
    theoreticalTotal,
    formattedExpiration,
    paddedDuration,
    expirationDate,

    // Account/connection
    isUsingAA,

    // Handlers
    handleChange,
    handleConfirmPayment,
    handleConnect,
  } = usePricing({
    domainName,
    duration,
    onSetDuration,
    onSelectPayment,
    onSelectCrypto,
    onConfirmPayment,
  })

  // Notify parent of pricing data changes
  const prevFinalPriceRef = React.useRef<number | null>(null)
  const prevDiscountAmountRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (
      onPricingDataChange &&
      !isPriceLoading &&
      (prevFinalPriceRef.current !== finalPrice ||
        prevDiscountAmountRef.current !== discountAmount)
    ) {
      prevFinalPriceRef.current = finalPrice
      prevDiscountAmountRef.current = discountAmount
      onPricingDataChange(finalPrice, discountAmount)
    }
  }, [finalPrice, discountAmount, isPriceLoading, onPricingDataChange])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pt-4 pb-12 md:px-10">
      {/* Domain Name Header */}
      <PricingDomainHeader
        domainName={domainName}
        premiumLabel={premiumLabel}
      />

      {/* Two Column Layout - Desktop / Single Column - Mobile */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_420px] lg:items-stretch">
        {/* Left Column: Duration Selector */}
        <div className="flex flex-col space-y-2 duration-selector-container">
          <DurationSelector
            pricing={pricingOptions}
            selectedDuration={selectedDuration as PricingDuration}
            onSelect={(duration: PricingDuration) => handleChange(duration)}
            disabled={isPricingLoading || isLoading}
          />
          {isPricingLoading && (
            <div className="text-center">
              <p className="text-slate-500 text-sm">Loading prices...</p>
            </div>
          )}
        </div>

        {/* Right Column: Summary Cards - Desktop / Mobile: Full width */}
        <div className="summary-cards-container flex w-full flex-col gap-2">
          {/* Registration Summary Card */}
          <PricingRegistrationSummaryCard
            paddedDuration={paddedDuration}
            formattedExpiration={formattedExpiration}
            expirationDate={expirationDate}
            onChange={handleChange}
          />

          {/* Total & Payment Card */}
          <div className="total-payment-card h-full space-y-6 rounded-2xl border border-ens-gray-two bg-white px-6 py-6 shadow-sm">
            {/* Total Price Section */}
            <PricingTotalPriceCard
              isPriceLoading={isPriceLoading}
              finalPrice={finalPrice}
              discountPercentage={discountPercentage}
              discountAmount={discountAmount}
              theoreticalTotal={theoreticalTotal}
            />

            {/* Payment Section */}
            <PricingPaymentSection
              isConnected={isConnected}
              isLoading={isLoading}
              domainName={domainName}
              selectedDuration={selectedDuration as PricingDuration}
              priceUSD={finalPrice}
              isPriceLoading={isPriceLoading}
              isUsingAA={isUsingAA}
              onConnect={handleConnect}
              onPaymentSelect={onSelectPayment}
              onCryptoSelect={onSelectCrypto}
              onConfirmPayment={handleConfirmPayment}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
