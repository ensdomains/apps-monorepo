import { Button } from '@/components/ui/button'
import { RegistrationDurationOrExpiryPicker } from '@/features/register/components/RegistrationDurationOrExpiryPicker'
import type { NamePricingData } from '../../hooks/useMultiNamePricing'
import { MultiNamePricingFooter } from './MultiNamePricingFooter'
import { MultiNameSummaryCard } from './MultiNameSummaryCard'

type MultiNameExtendSettingsProps = {
  readonly pricingData: readonly NamePricingData[]
  readonly total: number
  readonly totalDiscount: number
  readonly allLoaded: boolean
  readonly duration: number
  readonly setDuration: (duration: number) => void
  readonly onNext: () => void
}

export const MultiNameExtendSettings = ({
  pricingData,
  total,
  totalDiscount,
  allLoaded,
  duration,
  setDuration,
  onNext,
}: MultiNameExtendSettingsProps) => {
  return (
    <div className="space-y-6 mt-2">
      <RegistrationDurationOrExpiryPicker
        labelPrefix="Extend"
        duration={duration}
        setDuration={setDuration}
      />

      <div className="border border-border rounded-lg overflow-hidden">
        <ul>
          {pricingData.map((item) => (
            <li key={item.selectedName.name}>
              <MultiNameSummaryCard pricingData={item} />
            </li>
          ))}
        </ul>

        <div className="p-4">
          <MultiNamePricingFooter
            total={total}
            totalDiscount={totalDiscount}
            allLoaded={allLoaded}
          />
        </div>
      </div>

      <Button className="w-full" variant="secondary" onClick={onNext}>
        Next
      </Button>
    </div>
  )
}
