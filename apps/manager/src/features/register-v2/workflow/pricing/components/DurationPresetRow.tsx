import { Trans } from '@lingui/react/macro'
import { formatDuration } from 'date-fns'
import { match, P } from 'ts-pattern'
import { cn } from '@/lib/utils'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { secondsToDuration } from '../../../utils/time'

const getDiscountBadgeStyle = (discount: number) =>
  match(discount)
    .with(P.number.gte(30), () => 'bg-slate-700')
    .with(P.number.gte(20), () => 'bg-slate-600')
    .with(P.number.gte(15), () => 'bg-slate-500')
    .with(P.number.gt(0), () => 'bg-slate-400')
    .otherwise(() => undefined)

export const DurationPresetRow = ({
  duration,
  isSelected,
  price,
  onSelect,
  discountPercentage,
}: {
  duration: number
  isLoading: boolean
  price: number | undefined
  isSelected: boolean
  onSelect: () => void
  discountPercentage: number
}) => {
  return (
    <button
      aria-pressed={isSelected}
      className={cn(
        'group flex w-full cursor-pointer items-center justify-between rounded-lg border-[#DEDEDF] border-[0.5px] bg-neutral-50 px-3 py-4 transition-all hover:border-ens-blue aria-pressed:border-ens-blue md:px-5 md:py-8',
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex">
        <span className="font-normal text-base text-ens-blue-dark leading-none tracking-tighter md:text-2xl">
          {formatDuration(secondsToDuration(duration))}
        </span>
      </div>

      <div className="flex gap-3">
        {discountPercentage > 0 && (
          <div
            className={cn(
              getDiscountBadgeStyle(discountPercentage),
              'flex items-center justify-center rounded-xs px-1 py-0.5 md:px-1.5 md:py-1',
            )}
          >
            <span className="font-medium text-white text-xs leading-none tracking-tight md:text-base">
              <Trans>{discountPercentage}% off</Trans>
            </span>
          </div>
        )}

        <div className="flex h-5 items-baseline gap-1 md:gap-1.5">
          <span className="font-medium font-mono text-ens-blue-dark text-xl leading-none tracking-tighter md:text-temp-32px">
            {price ? (
              formatUsd(price)
            ) : (
              <span className="animate-pulse">$...</span>
            )}
          </span>
          <span className="font-normal text-[#A0A4A6] text-xs leading-none tracking-tight md:text-base">
            <Trans>total</Trans>
          </span>
        </div>
      </div>
    </button>
  )
}
