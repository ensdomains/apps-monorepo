import { useEffect, useRef } from 'react'
import { DurationSelector } from '@/features/register/components/CheckAvailability/DurationSelector'
import { PricingDomainHeader } from '@/features/register/components/Pricing/PricingDomainHeader'
import { PricingPaymentSection } from '@/features/register/components/Pricing/PricingPaymentSection'
import { PricingRegistrationSummaryCard } from '@/features/register/components/Pricing/PricingRegistrationSummaryCard'
import { PricingTotalPriceCard } from '@/features/register/components/Pricing/PricingTotalPriceCard'
import type { PricingProps } from '@/features/register/components/Pricing/types'
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

    // Shared input state
    durationInputValue,
    setDurationInputValue,

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
  const prevFinalPriceRef = useRef<number | null>(null)
  const prevDiscountAmountRef = useRef<number | null>(null)

  useEffect(() => {
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 pt-4 pb-12 md:px-10">
      {/* Domain Name Header */}
      <PricingDomainHeader
        domainName={domainName}
        premiumLabel={premiumLabel}
      />

      {/* Two Column Layout - Desktop / Single Column - Mobile */}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[2fr_420px] lg:items-stretch">
        {/* Left Column: Duration Selector */}
        <div className="flex flex-col space-y-2 duration-selector-container">
          <DurationSelector
            disabled={isPricingLoading || isLoading}
            durationInputValue={durationInputValue}
            onInputChange={setDurationInputValue}
            onSelect={handleChange}
            pricing={pricingOptions}
            selectedDuration={selectedDuration}
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
            durationInputValue={durationInputValue}
            expirationDate={expirationDate}
            formattedExpiration={formattedExpiration}
            onChange={handleChange}
            onInputChange={setDurationInputValue}
            paddedDuration={paddedDuration}
          />

          {/* Total & Payment Card */}
          <div className="total-payment-card flex h-full flex-col justify-between space-y-6 rounded-2xl border border-ens-gray-two bg-white px-4 py-6 shadow-sm md:px-6">
            {/* Total Price Section */}
            <PricingTotalPriceCard
              discountAmount={discountAmount}
              discountPercentage={discountPercentage}
              finalPrice={finalPrice}
              isPriceLoading={isPriceLoading}
              theoreticalTotal={theoreticalTotal}
            />

            {/* Payment Section */}
            <PricingPaymentSection
              domainName={domainName}
              isConnected={isConnected}
              isLoading={isLoading}
              isPriceLoading={isPriceLoading}
              isUsingAA={isUsingAA}
              onConfirmPayment={handleConfirmPayment}
              onConnect={handleConnect}
              onCryptoSelect={onSelectCrypto}
              onPaymentSelect={onSelectPayment}
              priceUSD={finalPrice}
              selectedDuration={selectedDuration}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
