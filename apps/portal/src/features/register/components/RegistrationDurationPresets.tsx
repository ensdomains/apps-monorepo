import { Badge } from '@/components/ui/badge'
import { getEffectivePricePerYear } from '@/features/register/utils/registrationDiscount'
import { getStandardPricePerYear } from '@/features/register/utils/registrationPricing'
import { cn } from '@/lib/utils'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'

export const PRESET_YEARS = [1, 2, 3, 5] as const

type RegistrationDurationPresetsProps = {
  readonly value: number
  readonly onSelect: (years: number) => void
  /** Name used to determine the standard $/year baseline (3-letter, 4-letter, 5+) */
  readonly name?: string
}

export const RegistrationDurationPresets = ({
  value,
  onSelect,
  name,
}: RegistrationDurationPresetsProps) => {
  const selectedYears = PRESET_YEARS.includes(
    value as (typeof PRESET_YEARS)[number],
  )
    ? value
    : undefined

  const basePricePerYear = name ? getStandardPricePerYear(name) : 0

  return (
    <div className="flex gap-2 items-center flex-wrap">
      {PRESET_YEARS.map((years) => {
        const isSelected = selectedYears === years
        const effective =
          basePricePerYear > 0
            ? getEffectivePricePerYear(basePricePerYear, years)
            : 0

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
            {`${years} years`}{' '}
            {effective > 0 ? (
              <span
                className={cn(
                  'font-normal',
                  isSelected ? 'text-primary' : 'text-success-text',
                )}
              >
                {`${formatUsd(effective)}/yr`}
              </span>
            ) : null}
          </Badge>
        )
      })}
    </div>
  )
}
