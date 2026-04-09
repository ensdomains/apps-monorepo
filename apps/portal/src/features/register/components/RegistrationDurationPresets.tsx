import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const PRESET_YEARS = [1, 3, 5, 10] as const

type RegistrationDurationPresetsProps = {
  readonly value: number
  readonly onSelect: (years: number) => void
  /** Discount percent keyed by preset year, derived from getPrice() vs base rate. */
  readonly discounts?: Partial<Record<(typeof PRESET_YEARS)[number], number>>
}

export const RegistrationDurationPresets = ({
  value,
  onSelect,
  discounts,
}: RegistrationDurationPresetsProps) => {
  const selectedYears = PRESET_YEARS.includes(
    value as (typeof PRESET_YEARS)[number],
  )
    ? value
    : undefined

  return (
    <div className="flex gap-2 items-center">
      {PRESET_YEARS.map((years) => {
        const percent = discounts?.[years] ?? 0
        const discount = percent > 0 ? `${Math.round(percent)}% off` : undefined
        const isSelected = selectedYears === years

        return (
          <Badge
            key={years}
            variant={isSelected ? 'secondary' : 'outline'}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(years)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(years)
              }
            }}
            className={cn(
              'cursor-pointer rounded-xs justify-center text-center px-2.5',
              'border',
              isSelected && 'border-transparent',
            )}
          >
            {`${years} year${years > 1 ? 's' : ''}`}{' '}
            {discount ? (
              <span
                className={cn(
                  'font-normal',
                  isSelected ? 'text-primary' : 'text-success',
                )}
              >
                {discount}
              </span>
            ) : null}
          </Badge>
        )
      })}
    </div>
  )
}
