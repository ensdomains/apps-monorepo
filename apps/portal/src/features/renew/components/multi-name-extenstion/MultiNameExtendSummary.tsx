import { useQueries } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { getRegistrationPriceQueryOptions } from '@/features/register/hooks/useRegistrationPrice'
import { isPriceResult } from '@/features/register/utils/registrationPrice'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import type { SelectedName } from '../../hooks/useRenewalTransactions'
import {
  MultiNameSummaryCard,
  MultiNameSummaryCardSkeleton,
} from './MultiNameSummaryCard'

type MultiNameExtendSummaryProps = {
  readonly selectedNames: readonly SelectedName[]
  readonly duration: number
  readonly onNext: () => void
}

export const MultiNameExtendSummary = ({
  selectedNames,
  duration,
  onNext,
}: MultiNameExtendSummaryProps) => {
  const priceQueries = useQueries({
    queries: selectedNames.map((selected) =>
      getRegistrationPriceQueryOptions({
        name: selected.name,
        duration,
      }),
    ),
  })

  const totals = priceQueries.reduce(
    (acc, query) => {
      if (!query.data || !isPriceResult(query.data)) return acc
      const price = query.data
      const actualPrice = Number(price.base) / 10 ** price.decimals
      return {
        total: acc.total + actualPrice,
        loaded: acc.loaded + 1,
      }
    },
    { total: 0, loaded: 0 },
  )

  const allLoaded = totals.loaded === selectedNames.length

  return (
    <div className="space-y-4 mt-2">
      <ul className="space-y-2">
        {selectedNames.map((selected, index) => {
          const query = priceQueries[index]
          const price =
            query?.data && isPriceResult(query.data) ? query.data : null

          return (
            <li key={selected.name}>
              {price ? (
                <MultiNameSummaryCard
                  selectedName={selected}
                  price={price}
                  duration={duration}
                />
              ) : (
                <MultiNameSummaryCardSkeleton name={selected.name} />
              )}
            </li>
          )
        })}
      </ul>

      <div className="border-t border-border pt-4 space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-quartz-350">Total:</span>
          <span className="text-xl font-semibold text-primary">
            {allLoaded ? formatUsd(totals.total) : '—'}
          </span>
        </div>
      </div>

      <Button className="w-full" variant="secondary" onClick={onNext}>
        Next
      </Button>
    </div>
  )
}
