import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { getOracleParamsQueryOptions } from '@/features/register/hooks/useOracleParams'
import {
  formatDiscountPercentForDisplay,
  getDiscountForYears,
} from '@/features/register/utils/registrationDiscount'
import { cn } from '@/lib/utils'

const PRESET_YEARS = [1, 3, 5, 10]

type RegistrationDurationPresetsProps = {
  readonly value: number
  readonly onSelect: (years: number) => void
}

export const RegistrationDurationPresets = ({
  value,
  onSelect,
}: RegistrationDurationPresetsProps) => {
  const { data: oracleData } = useQuery(getOracleParamsQueryOptions)

  const selectedYears = PRESET_YEARS.includes(value) ? value : undefined

  return (
    <div className="flex gap-2 items-center">
      {PRESET_YEARS.map((years) => {
        const { percent } = getDiscountForYears(
          years,
          oracleData?.discountPoints,
        )
        const discount =
          percent > 0
            ? `${formatDiscountPercentForDisplay(percent)} off`
            : undefined
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
