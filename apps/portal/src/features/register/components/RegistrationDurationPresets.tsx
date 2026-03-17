import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const DISCOUNT_CONFIG = [
  { spanValue: 1, spanLabel: '1 year', discount: undefined },
  { spanValue: 3, spanLabel: '3 years', discount: '25% off' },
  { spanValue: 5, spanLabel: '5 years', discount: '40% off' },
  { spanValue: 10, spanLabel: '10 years', discount: '50% off' },
] as const

type RegistrationDurationPresetsProps = {
  readonly selectedYears: number | undefined
  readonly onSelectedYearsChange: (years: number) => void
}

export const RegistrationDurationPresets = ({
  selectedYears,
  onSelectedYearsChange,
}: RegistrationDurationPresetsProps) => {
  return (
    <div className="flex gap-2 items-center">
      {DISCOUNT_CONFIG.map(({ spanValue, spanLabel, discount }) => {
        const isSelected = selectedYears === spanValue

        return (
          <Badge
            key={spanValue}
            variant={isSelected ? 'secondary' : 'outline'}
            onClick={() => onSelectedYearsChange(spanValue)}
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
