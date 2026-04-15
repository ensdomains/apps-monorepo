import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { TokenWithPriceAndBalance } from '@/features/register/utils/tokenData'
import type { NamePricingData } from '../../hooks/useMultiNamePricing'
import { MultiNameConfirmCard } from './MultiNameConfirmCard'
import { MultiNamePaymentTokenPicker } from './MultiNamePaymentTokenPicker'
import { MultiNamePricingFooter } from './MultiNamePricingFooter'

type MultiNameExtendSummaryProps = {
  readonly pricingData: readonly NamePricingData[]
  readonly total: number
  readonly totalDiscount: number
  readonly allLoaded: boolean
  readonly duration: number
  readonly onBack: () => void
  readonly onNext: (token: TokenWithPriceAndBalance) => void
}

export const MultiNameExtendSummary = ({
  pricingData,
  total,
  totalDiscount,
  allLoaded,
  duration,
  onBack,
  onNext,
}: MultiNameExtendSummaryProps) => {
  const [selectedToken, setSelectedToken] =
    useState<TokenWithPriceAndBalance | null>(null)

  const names = pricingData.map((item) => item.selectedName.name)

  return (
    <div className="space-y-4 mt-2">
      <div className="border border-border rounded-lg overflow-hidden">
        <ul className="space-y-2">
          {pricingData.map((item) => (
            <li key={item.selectedName.name}>
              <MultiNameConfirmCard pricingData={item} />
            </li>
          ))}
        </ul>

        <MultiNamePricingFooter
          total={total}
          totalDiscount={totalDiscount}
          allLoaded={allLoaded}
        />
      </div>

      <MultiNamePaymentTokenPicker
        names={names}
        duration={duration}
        onSelectionChange={setSelectedToken}
      />

      <div className="flex gap-2">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <Button
          className="flex-1"
          variant="secondary"
          disabled={!selectedToken}
          onClick={() => selectedToken && onNext(selectedToken)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
