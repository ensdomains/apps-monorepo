import { Button } from '@/components/ui/button'
import { RegistrationDurationOrExpiryPicker } from '@/features/register/components/RegistrationDurationOrExpiryPicker'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import type { NamePricingData } from '../../hooks/useMultiNamePricing'
import { MultiNameSummaryCard } from './MultiNameSummaryCard'

type MultiNameExtendSettingsProps = {
  readonly pricingData: readonly NamePricingData[]
  readonly total: number
  readonly allLoaded: boolean
  readonly duration: number
  readonly setDuration: (duration: number) => void
  readonly onNext: () => void
}

export const MultiNameExtendSettings = ({
  pricingData,
  total,
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

        <div className="flex items-baseline justify-between p-4 text-lapis-500 font-medium">
          <span className="text-xl">Total:</span>
          <span className="text-xl">{allLoaded ? formatUsd(total) : '—'}</span>
        </div>
      </div>

      <Button className="w-full" variant="secondary" onClick={onNext}>
        Next
      </Button>
    </div>
  )
}
