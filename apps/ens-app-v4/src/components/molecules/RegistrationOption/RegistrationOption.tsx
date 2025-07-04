import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface RegistrationOptionProps
  extends Omit<HTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  years: number
  discount?: number
  pricePerYear?: number
  selected?: boolean
  disabled?: boolean
  onSelect?: (years: number) => void
}

export const RegistrationOption = ({
  years,
  discount,
  pricePerYear,
  selected = false,
  disabled = false,
  onSelect,
  className,
  ...props
}: RegistrationOptionProps) => {
  const handleClick = () => {
    if (!disabled && onSelect) {
      onSelect(years)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if ((event.key === 'Enter' || event.key === ' ') && !disabled) {
      event.preventDefault()
      onSelect?.(years)
    }
  }

  return (
    <button
      className={cn(
        'flex flex-col items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all duration-200',
        'hover:border-primary hover:bg-primary/5',
        selected && 'border-primary bg-primary/10 ring-2 ring-primary/20',
        disabled &&
          'opacity-50 cursor-not-allowed hover:border-border hover:bg-background',
        className,
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-pressed={selected}
      disabled={disabled}
      {...props}
    >
      <div className="text-lg font-semibold text-foreground">
        {years} {years === 1 ? 'year' : 'years'}
      </div>

      {discount && discount > 0 && (
        <div className="text-sm font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full mt-1">
          {discount}% off
        </div>
      )}

      {pricePerYear && (
        <div className="text-xl font-bold text-foreground mt-2">
          ${pricePerYear * years}
        </div>
      )}
    </button>
  )
}

export interface RegistrationOptionsGroupProps {
  options: Array<{
    years: number
    discount?: number
    pricePerYear?: number
  }>
  selectedYears?: number
  basePricePerYear?: number
  onSelect?: (years: number) => void
  className?: string
}

export const RegistrationOptionsGroup = ({
  options,
  selectedYears,
  basePricePerYear = 160,
  onSelect,
  className,
}: RegistrationOptionsGroupProps) => {
  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-4 gap-4', className)}>
      {options.map(({ years, discount, pricePerYear }) => (
        <RegistrationOption
          key={years}
          years={years}
          discount={discount}
          pricePerYear={pricePerYear || basePricePerYear}
          selected={selectedYears === years}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

RegistrationOption.displayName = 'RegistrationOption'
RegistrationOptionsGroup.displayName = 'RegistrationOptionsGroup'
