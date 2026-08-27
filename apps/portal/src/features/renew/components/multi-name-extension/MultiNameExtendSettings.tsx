import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { NamePricingData } from '../../hooks/useMultiNamePricing'
import type { ExtensionSpan } from '../../utils/extensionDurationPicker'
import { ExtensionDurationOrExpiryPicker } from '../ExtensionDurationOrExpiryPicker'
import { MultiNamePricingFooter } from './MultiNamePricingFooter'
import { MultiNameSummaryCard } from './MultiNameSummaryCard'

type MultiNameExtendSettingsProps = {
  readonly pricingData: readonly NamePricingData[]
  readonly total: number
  readonly totalDiscount: number
  readonly allLoaded: boolean
  readonly latestExpiry: Date | null
  readonly span: ExtensionSpan
  readonly setSpan: (span: ExtensionSpan) => void
  readonly onBack: () => void
  readonly onNext: () => void
}

export const MultiNameExtendSettings = ({
  pricingData,
  total,
  totalDiscount,
  allLoaded,
  latestExpiry,
  span,
  setSpan,
  onBack,
  onNext,
}: MultiNameExtendSettingsProps) => {
  return (
    <div className="space-y-6 mt-2">
      <ExtensionDurationOrExpiryPicker
        span={span}
        setSpan={setSpan}
        expiryDate={latestExpiry}
      />

      <div className="border border-border rounded-lg overflow-hidden">
        <ul>
          {pricingData.map((item) => (
            <li key={item.selectedName.name}>
              <MultiNameSummaryCard pricingData={item} />
            </li>
          ))}
        </ul>

        <MultiNamePricingFooter
          total={total}
          totalDiscount={totalDiscount}
          allLoaded={allLoaded}
        />
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <Button className="flex-1" variant="default" onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  )
}
