import { ArrowLeft } from 'lucide-react'
import { formatUnits } from 'viem'
import { Button } from '@/components/ui/button'
import type { TokenWithPriceAndBalance } from '@/features/register/utils/tokenData'
import type { NamePricingData } from '../../hooks/useMultiNamePricing'
import { MultiNamePricingFooter } from './MultiNamePricingFooter'
import { MultiNameSummaryCard } from './MultiNameSummaryCard'

type MultiNameExtendConfirmationProps = {
  readonly pricingData: readonly NamePricingData[]
  readonly total: number
  readonly totalDiscount: number
  readonly allLoaded: boolean
  readonly selectedToken: TokenWithPriceAndBalance
  readonly onBack: () => void
  readonly onConfirm: () => void
  readonly isConfirming: boolean
}

export const MultiNameExtendConfirmation = ({
  pricingData,
  total,
  totalDiscount,
  allLoaded,
  selectedToken,
  onBack,
  onConfirm,
  isConfirming,
}: MultiNameExtendConfirmationProps) => {
  const tokenAmountFormatted = Number(
    formatUnits(selectedToken.price.total, selectedToken.decimals),
  ).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

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

      <div className="border border-border rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <selectedToken.Icon className="size-8" />
          <span className="font-medium">{selectedToken.symbol}</span>
        </div>
        <div className="text-right">
          <p className="font-medium">
            {tokenAmountFormatted} {selectedToken.symbol}
          </p>
          <p className="text-muted-foreground text-xs">payment method</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={onBack}
          disabled={isConfirming}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Button
          className="flex-1"
          variant="secondary"
          onClick={onConfirm}
          disabled={isConfirming}
        >
          {isConfirming ? 'Confirming...' : 'Confirm'}
        </Button>
      </div>
    </div>
  )
}
