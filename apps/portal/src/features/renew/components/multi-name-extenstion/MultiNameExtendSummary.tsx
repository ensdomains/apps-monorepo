import { Button } from '@/components/ui/button'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import type { NamePricingData } from '../../hooks/useMultiNamePricing'
import { MultiNameSummaryCard } from './MultiNameSummaryCard'

type MultiNameExtendSummaryProps = {
  readonly pricingData: readonly NamePricingData[]
  readonly total: number
  readonly allLoaded: boolean
  readonly onNext: () => void
}

export const MultiNameExtendSummary = ({
  pricingData,
  total,
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

      <div className="border-t border-border pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-quartz-350">Total:</span>
          <span className="text-xl font-semibold text-primary">
            {allLoaded ? formatUsd(total) : '—'}
          </span>
        </div>
      </div>

      <Button className="w-full" variant="secondary" onClick={onNext}>
        Next
      </Button>
    </div>
  )
}
