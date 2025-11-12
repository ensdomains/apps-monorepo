import { cn } from '@/lib/utils'
import type { PricingDuration, PricingOptions } from '../types'

type DurationSelectorProps = {
  pricing: PricingOptions
  selectedDuration: PricingDuration | null
  onSelect: (duration: PricingDuration) => void
  disabled?: boolean
}

const durationOrder: PricingDuration[] = [1, 2, 3, 4, 5]

type CardContentProps = {
  option: PricingOptions[PricingDuration]
  isSelected: boolean
  disabled?: boolean
  className?: string
}

const DurationCardContent = ({
  option,
  isSelected,
  disabled,
  className,
}: CardContentProps) => {
  const formattedPrice = option.price.toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })

  return (
    <div
      className={cn(
        'relative',
        'flex',
        'w-full',
        'min-w-[114px]',
        'h-[116px]',
        'flex-col',
        'items-center',
        'gap-2',
        'rounded-sm',
        'border',
        'bg-white',
        'px-6',
        'text-center',
        'transition-colors',
        isSelected ? 'border-[#0080bc]' : 'border-[#d4d9db]',
        !isSelected && !disabled && 'group-hover:border-[#0080bc]',
        className,
      )}
    >
      {option.discount > 0 && (
        <span
          className={cn(
            'absolute',
            '-top-3',
            'right-0',
            'rounded-full',
            'bg-[#0080bc]',
            'px-3',
            'py-1',
            'text-xs',
            'font-semibold',
            'uppercase',
            'tracking-wide',
            'text-white',
            'shadow-sm',
          )}
        >
          {option.discount}% off
        </span>
      )}
      <div className="flex h-full flex-col items-center justify-center gap-0">
        <span
          className={cn(
            'm-0',
            'leading-zero',
            'text-[14px]',
            'font-normal',
            'tracking-[-0.456px]',
            'text-primary-dark-blue',
          )}
        >
          {option.label}
        </span>
        <p
          className={cn(
            'm-0',
            'text-[24px]',
            'font-semibold',
            'leading-[35px]',
            'tracking-[-0.456px]',
            'text-primary-midnight-blue',
          )}
        >
          ${formattedPrice}
        </p>
        <p
          className={cn(
            'm-0',
            'leading-zero',
            'font-["ABC_Monument_Grotesk"]',
            'text-[12px]',
            'font-normal',
            'tracking-[-0.223px]',
            'text-[#A0A4A6]',
          )}
        >
          per year
        </p>
      </div>
    </div>
  )
}

export const DurationSelector = ({
  pricing,
  selectedDuration,
  onSelect,
  disabled,
}: DurationSelectorProps) => {
  return (
    <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {durationOrder.map((duration) => {
        const option = pricing[duration]
        const isSelected = duration === selectedDuration
        const isBest = option.badge === 'best'

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
              'flex-col',
              'items-stretch',
              'focus-visible:outline-2',
              'focus-visible:outline-offset-2',
              'focus-visible:outline-[#0080bc]',
              isBest
                ? cn(
                    'gap-3',
                    'rounded-sm',
                    'bg-gray-200',
                    'px-[4px]',
                    'py-1',
                    'text-left',
                  )
                : cn('rounded-[10px]', 'bg-transparent', 'p-0', 'text-center'),
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            {isBest && (
              <span
                className={cn(
                  'text-sm',
                  'font-semibold',
                  'text-[#011a25]',
                  'text-center',
                )}
              >
                Best value
              </span>
            )}
            <DurationCardContent
              option={option}
              isSelected={isSelected}
              disabled={disabled}
              className={cn(isBest && 'mt-1')}
            />
          </button>
        )
      })}
    </div>
  )
}
