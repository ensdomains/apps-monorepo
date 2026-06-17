import { useGlobalBackButton } from '@/components/GlobalBackButton'
import { PricingDomainHeader } from '@/features/register-v2/workflow/pricing/components/PricingDomainHeader'
import { useRenewalUiContext } from '../../state/renewalUi.context'
import { RenewPageLayout } from '../components/RenewPageLayout'
import { DurationSelector } from './components/DurationSelector'
import { PaymentCard } from './components/PaymentCard'
import { PricingSummaryCard } from './components/PricingSummaryCard'
import { TokenPickerDialog } from './components/TokenPickerDialog'

export const RenewPricingStep = () => {
  const { label } = useRenewalUiContext()
  useGlobalBackButton({ isVisible: true })

  return (
    <RenewPageLayout>
      <PricingDomainHeader label={label} />

      <div className="grid grid-cols-1 gap-1.5 md:gap-2 lg:grid-cols-[2fr_420px] lg:items-stretch">
        <DurationSelector />

        <div className="flex flex-col gap-1.5 md:gap-2">
          <PricingSummaryCard />
          <PaymentCard />
        </div>
      </div>
      <TokenPickerDialog />
    </RenewPageLayout>
  )
}
