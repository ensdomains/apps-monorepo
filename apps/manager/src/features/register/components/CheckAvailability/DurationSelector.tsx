import { cn } from '@/lib/utils'
import type { PricingDuration, PricingOptions } from './types'

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
    switch (duration) {
      case 2:
        return 'bg-slate-400' // 15% off
      case 3:
        return 'bg-slate-500' // 40% off
      case 4:
        return 'bg-slate-600' // 45% off
      case 5:
        return 'bg-slate-700' // 50% off
      default:
        return 'bg-slate-400'
    }
  }

  return (
    <div className="flex flex-col gap-1 md:gap-2">
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
              'group',
              'relative',
              'flex',
              'w-full',
              'h-[58px]',
              'md:h-[100px]',
              'items-center',
              'justify-between',
              'px-3',
              'py-[18px]',
              'md:px-5',
              'md:py-8',
              'rounded-lg',
              'md:rounded-xl',
              'border',
              'transition-all',
              'bg-[#f8fafc]',
              isSelected ? 'border-brand-blue' : 'border-[#dededf]',
              !isSelected && !disabled && 'hover:border-brand-blue',
              disabled && 'cursor-not-allowed opacity-60',
              'focus-visible:outline-2',
              'focus-visible:outline-offset-2',
              'focus-visible:outline-brand-blue',
            )}
          >
            {/* Left: Year label */}
            <div className="flex items-center gap-3 md:gap-5">
              <span className="font-normal text-[14px] text-primary-dark-blue leading-none tracking-[-0.77px] md:text-[24px]">
                {duration} year{duration > 1 ? 's' : ''}
              </span>
            </div>

            {/* Right: Discount badge + Price */}
            <div className="flex items-center gap-2 md:gap-3">
              {option.discount > 0 && (
                <div
                  className={cn(
                    getBadgeColor(duration),
                    'rounded-sm px-[3.5px] py-[2.5px] md:px-[6px] md:py-1',
                  )}
                >
                  <span className="font-medium text-[12px] text-white leading-none tracking-[-0.14px] md:text-[16px] md:tracking-[-0.23px]">
                    {option.discount}% off
                  </span>
                </div>
              )}
              <div className="flex items-baseline gap-1 md:gap-[6px]">
                <span className="font-medium font-mono text-[#1d293d] text-[19px] leading-none tracking-[-0.77px] md:text-[32px]">
                  ${formattedTotalPrice}
                </span>
                <span className="font-normal text-[#a0a4a6] text-[9px] leading-none tracking-[-0.38px] md:text-[16px]">
                  Total
                </span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
