import { Button } from '@/components/ui/button'
import type { NamePricingData } from '../../hooks/useMultiNamePricing'
import { MultiNamePricingFooter } from './MultiNamePricingFooter'
import { MultiNameSummaryCard } from './MultiNameSummaryCard'

type MultiNameExtendSummaryProps = {
  readonly pricingData: readonly NamePricingData[]
  readonly total: number
  readonly totalDiscount: number
  readonly allLoaded: boolean
  readonly onNext: () => void
}

export const MultiNameExtendSummary = ({
  pricingData,
  total,
  totalDiscount,
  allLoaded,
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

      <Button className="w-full" variant="secondary" onClick={onNext}>
        Next
      </Button>
    </div>
  )
}
