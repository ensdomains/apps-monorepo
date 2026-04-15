import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { NamePricingData } from '../../hooks/useMultiNamePricing'
import { MultiNamePricingFooter } from './MultiNamePricingFooter'
import { MultiNameSummaryCard } from './MultiNameSummaryCard'

type MultiNameExtendSummaryProps = {
  readonly pricingData: readonly NamePricingData[]
  readonly total: number
  readonly totalDiscount: number
  readonly allLoaded: boolean
  readonly onBack: () => void
  readonly onNext: () => void
}

export const MultiNameExtendSummary = ({
  pricingData,
  total,
  totalDiscount,
  allLoaded,
  onBack,
  onNext,
}: MultiNameExtendSummaryProps) => {
  return (
    <div className="space-y-4 mt-2">
      <ul className="space-y-2">
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

      <div className="flex gap-2">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <Button className="flex-1" variant="secondary" onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  )
}
