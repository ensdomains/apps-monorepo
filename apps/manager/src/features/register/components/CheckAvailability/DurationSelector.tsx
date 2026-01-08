import { match } from 'ts-pattern'
import type {
  PricingDuration,
  PricingOptions,
} from '@/features/register/components/Pricing/types'
import { cn } from '@/lib/utils'

type DurationSelectorProps = {
  pricing: PricingOptions
  selectedDuration: PricingDuration | null
  onSelect: (duration: PricingDuration) => void
  disabled?: boolean
}

const durationOrder: PricingDuration[] = [1, 2, 3, 4, 5]

export const DurationSelector = ({
  pricing,
  selectedDuration,
  onSelect,
  disabled,
}: DurationSelectorProps) => {
  // Map discount badges to darker colors for higher durations
  const getBadgeColor = (duration: PricingDuration) => {
    return match(duration)
      .with(2, () => 'bg-slate-400') // 15% off
      .with(3, () => 'bg-slate-500') // 40% off
      .with(4, () => 'bg-slate-600') // 45% off
      .with(5, () => 'bg-slate-700') // 50% off
      .otherwise(() => 'bg-slate-400')
  }

  return (
    <div className="flex h-full flex-col justify-between gap-1 md:gap-2">
      {durationOrder.map((duration) => {
        const option = pricing[duration]
        const isSelected = duration === selectedDuration

        const formattedTotalPrice = (option.price * duration).toLocaleString(
          undefined,
          {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          },
        )

        return (
          <button
            key={duration}
            type="button"
            disabled={disabled}
            aria-pressed={isSelected}
            onClick={() => onSelect(duration)}
            className={cn(
              'group relative',
              'flex h-[58px] w-full items-center justify-between md:h-[100px]',
              'px-3 py-4 md:px-5 md:py-8',
              'rounded-lg border border-ens-gray-three hover:border-ens-blue disabled:hover:border-ens-gray-three aria-pressed:border-ens-blue md:rounded-xl',
              'bg-ens-white transition-all',
              'aria-pressed:hover:border-ens-blue',
              'disabled:cursor-not-allowed disabled:opacity-60',
              'focus-visible:outline-2 focus-visible:outline-offset-2',
              'focus-visible:outline-ens-blue',
            )}
          >
            {/* Left: Year label */}
            <div className="flex w-[50%] items-center gap-3 md:w-[60%] md:gap-5 lg:w-[40%] xl:w-[60%]">
              <span className="font-normal text-ens-blue-dark text-sm leading-none tracking-tighter md:text-2xl">
                {duration} year{duration > 1 ? 's' : ''}
              </span>
            </div>

            {/* Right: Discount badge + Price */}
            <div className="flex w-[50%] items-center justify-between gap-2 md:w-[40%] md:gap-3 lg:w-[60%] xl:w-[40%]">
              {option.discount > 0 ? (
                <div
                  className={cn(
                    getBadgeColor(duration),
                    'flex items-center justify-center rounded-xs px-1 py-0.5 md:px-1.5 md:py-1',
                  )}
                >
                  <span className="font-medium text-white text-xs leading-none tracking-tight md:text-base">
                    {option.discount}% off
                  </span>
                </div>
              ) : (
                <div className="w-10" />
              )}

              <div className="flex items-baseline gap-1 md:gap-1.5">
                <span className="font-medium font-mono text-ens-blue-dark text-xl leading-none tracking-tighter md:text-3xl">
                  ${formattedTotalPrice}
                </span>
                <span className="font-normal text-ens-gray-three text-xs leading-none tracking-tight md:text-base">
                  total
                </span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
