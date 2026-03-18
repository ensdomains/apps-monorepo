import { DurationSelector } from './components/DurationSelector'
import { PaymentCard } from './components/PaymentCard'
import { PricingDomainHeader } from './components/PricingDomainHeader'
import { PricingSummaryCard } from './components/PricingSummaryCard'
import { TokenPickerDialog } from './components/TokenPickerDialog'

export const PricingStep = () => {
  return (
    <>
      <PricingDomainHeader />

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[2fr_420px] lg:items-stretch">
        <DurationSelector />

        <div className="flex flex-col gap-2">
          <PricingSummaryCard />
          <PaymentCard />
        </div>
      </div>
      <TokenPickerDialog />
    </>
  )
}
