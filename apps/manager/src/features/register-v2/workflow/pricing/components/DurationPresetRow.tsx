import { useLingui } from '@lingui/react'
import { Plural, Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { tw } from '@/utils/tailwind'
import type { DurationPresetData } from './durationPresets'

const YEARLY_PRICE_STYLE = {
  citrine: tw`text-ens-citrine-500 bg-ens-citrine-100`,
  peridot: tw`text-ens-peridot-500 bg-ens-peridot-100`,
  garnet: tw`text-ens-garnet-500 bg-ens-garnet-100`,
} as const

export const DurationPresetRow = ({
  data,
  isSelected,
  price,
  total = price,
  onSelect,
  priceLabel = <Trans>base price</Trans>,
}: {
  data: DurationPresetData
  isLoading: boolean
  /** The base price the per-year pill divides. */
  price: number | undefined
  /** The headline figure, when it differs from `price`: a premium is part of the total but never of the per-year price. */
  readonly total?: number
  isSelected: boolean
  onSelect: () => void
  /** The word after the price. */
  readonly priceLabel?: ReactNode
}) => {
  const { _ } = useLingui()

  const yearlyPrice = price ? price / data.years : undefined

  return (
    <button
      aria-pressed={isSelected}
      className={cn(
        'group relative flex w-full min-w-0 cursor-pointer flex-col gap-3 rounded-lg transition-all',
        'border border-[#DEDEDF] bg-neutral-50 px-3 py-4 hover:border-ens-lapis-900 aria-pressed:border-ens-lapis-900 md:px-5 md:py-5',
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-[425] text-base text-ens-quartz-900 md:text-2xl">
          {_(data.title)}
        </span>
        <span className="font-normal text-ens-quartz-400 text-xs italic md:text-base">
          {_(data.subtitle)}
        </span>
      </div>

      <div className="flex w-full min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
        <span className="font-normal text-base text-ens-quartz-900 leading-none tracking-tighter md:text-2xl">
          <Plural one="# year" other="# years" value={data.years} />
        </span>

        <div
          className={tw(
            YEARLY_PRICE_STYLE[data.color],
            'flex min-h-5 max-w-full items-center justify-center rounded-full px-2 font-[450] text-xs',
          )}
        >
          <span className="wrap-anywhere">
            {yearlyPrice ? formatUsd(yearlyPrice) : '...'}/year
          </span>
        </div>

        <div className="ml-auto flex min-w-0 max-w-full basis-full flex-wrap items-baseline justify-end gap-1 md:basis-auto md:gap-1.5">
          <span className="wrap-anywhere min-w-0 font-medium font-mono text-ens-blue-dark text-xl leading-none tracking-tighter md:text-temp-32px">
            {total ? (
              formatUsd(total)
            ) : (
              <span className="animate-pulse">$...</span>
            )}
          </span>
          <span className="font-normal text-[#A0A4A6] text-xs leading-none tracking-tight md:text-base">
            {priceLabel}
          </span>
        </div>
      </div>

      {data.kind === 'mostPopular' && (
        <div className="absolute -top-2 -left-1 flex min-h-5 max-w-full items-center justify-center rounded-full bg-ens-lapis-900 px-2">
          <span className="font-[450] text-white text-xs">
            <Trans>Most popular</Trans>
          </span>
        </div>
      )}
    </button>
  )
}
