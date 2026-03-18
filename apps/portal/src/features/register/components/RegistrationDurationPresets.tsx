import { Badge } from '@/components/ui/badge'
import {
  formatDiscountPercentForDisplay,
  getDiscountForYears,
} from '@/features/register/utils/registrationDiscount'
import { cn } from '@/lib/utils'

const PRESET_YEARS = [1, 3, 5, 10] as const

const DISCOUNT_CONFIG = PRESET_YEARS.map((years) => {
  const { percent } = getDiscountForYears(years)
  return {
    spanValue: years,
    spanLabel: `${years} year${years > 1 ? 's' : ''}`,
    discount:
      percent > 0
        ? `${formatDiscountPercentForDisplay(percent)} off`
        : undefined,
  }
})

type RegistrationDurationPresetsProps = {
  readonly value: number
  readonly onSelect: (years: number) => void
}

export const RegistrationDurationPresets = ({
  value,
  onSelect,
}: RegistrationDurationPresetsProps) => {
  const selectedYears = (PRESET_YEARS as readonly number[]).includes(value)
    ? value
    : undefined

  return (
    <div className="flex gap-2 items-center">
      {DISCOUNT_CONFIG.map(({ spanValue, spanLabel, discount }) => {
        const isSelected = selectedYears === spanValue

        return (
          <Badge
            key={spanValue}
            variant={isSelected ? 'secondary' : 'outline'}
            onClick={() => onSelect(spanValue)}
            className={cn(
              'cursor-pointer rounded-xs justify-center text-center px-2.5',
              'border',
              isSelected && 'border-transparent',
            )}
          >
            {spanLabel}{' '}
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
