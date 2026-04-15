import { formatUsd } from '@/utils/formatting/formatUsdCeil'

type MultiNamePricingFooterProps = {
  readonly total: number
  readonly totalDiscount: number
  readonly allLoaded: boolean
}

export const MultiNamePricingFooter = ({
  total,
  totalDiscount,
  allLoaded,
}: MultiNamePricingFooterProps) => {
  const showDiscount = allLoaded && totalDiscount > 0

  return (
    <div className="space-y-1">
      {showDiscount && (
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-quartz-350">Total discount:</span>
          <span className="text-sm font-medium text-peridot-600">
            -{formatUsd(totalDiscount)}
          </span>
        </div>
      )}
      <div className="flex items-baseline justify-between">
        <span className="text-xl text-lapis-500 font-medium">Total:</span>
        <span className="text-xl text-lapis-500 font-medium">
          {allLoaded ? formatUsd(total) : '—'}
        </span>
      </div>
    </div>
  )
}
