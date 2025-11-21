import { DurationSelector } from '../CheckAvailability/components/DurationSelector'
import { PricingDomainHeader } from './components/PricingDomainHeader'
import { PricingPaymentSection } from './components/PricingPaymentSection'
import { PricingRegistrationSummaryCard } from './components/PricingRegistrationSummaryCard'
import { PricingTotalPriceCard } from './components/PricingTotalPriceCard'
import type { PricingProps } from './types'
import { usePricing } from './usePricing'

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
  const {
    // State
    pricingOptions,
    selectedDuration,
    isPricingLoading,
    isPriceLoading,

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
  } = usePricing({
    domainName,
    duration,
    onSetDuration,
    onSelectPayment,
    onSelectCrypto,
    onConfirmPayment,
  })

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pt-4 pb-12 md:px-10">
      {/* Domain Name Header */}
      <PricingDomainHeader
        domainName={domainName}
        isPremium={isPremium}
        premiumLabel={premiumLabel}
      />

      {/* Two Column Layout - Desktop / Single Column - Mobile */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_420px]">
        {/* Left Column: Duration Selector */}
        <div className="space-y-2">
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
        <div className="flex w-full flex-col gap-4">
          {/* Registration Summary Card */}
          <PricingRegistrationSummaryCard
            paddedDuration={paddedDuration}
            formattedExpiration={formattedExpiration}
          />

          {/* Total & Payment Card */}
          <div className="space-y-8 rounded-2xl border border-[#ddddde] bg-white px-6 py-8 shadow-sm">
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
              selectedDuration={selectedDuration}
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
