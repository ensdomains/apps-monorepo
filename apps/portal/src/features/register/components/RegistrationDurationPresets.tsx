import { useQueries } from '@tanstack/react-query'
import { formatUnits } from 'viem'
import { Badge } from '@/components/ui/badge'
import { getAppliedDiscountQueryOptions } from '@/features/register/hooks/useAppliedDiscount'
import { useBaseRate } from '@/features/register/hooks/useBaseRate'
import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'
import { ORACLE_PRICE_DECIMALS } from '@/lib/constants/oracle'
import { cn } from '@/lib/utils'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'

export const PRESET_YEARS = [1, 2, 3, 5] as const

const PRESET_DURATIONS_SECONDS = PRESET_YEARS.map(
  (years) => years * CONTRACT_SECONDS_PER_YEAR,
)

/**
 * Contract-equivalent effective $/year for a given duration. `discountedBase`
 * is `applyDiscount(baseRate × duration, duration)` straight from the oracle
 * (the full discounted base for the term); per-year is just `/ years`.
 */
const computeEffectivePerYear = (
  discountedBase: bigint,
  years: number,
): number => {
  if (discountedBase <= 0n || years <= 0) return 0
  const perYearUnits = discountedBase / BigInt(years)
  return Number(formatUnits(perYearUnits, ORACLE_PRICE_DECIMALS))
}

type RegistrationDurationPresetsProps = {
  readonly value: number
  readonly onSelect: (years: number) => void
  /** Name used to look up the per-character base rate. Chips hidden if absent. */
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

  const baseRate = useBaseRate(name ?? '')
  const discountQueries = useQueries({
    queries: PRESET_DURATIONS_SECONDS.map((duration) =>
      getAppliedDiscountQueryOptions({
        value: baseRate * BigInt(duration),
        duration,
      }),
    ),
  })

  return (
    <div className="flex gap-2 items-center flex-wrap">
      {PRESET_YEARS.map((years, idx) => {
        const isSelected = selectedYears === years
        const discountedBase = discountQueries[idx]?.data ?? 0n
        const effective = computeEffectivePerYear(discountedBase, years)

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
