import type { MessageDescriptor } from '@lingui/core'
import { useLingui } from '@lingui/react'
import { Trans } from '@lingui/react/macro'
import { formatDuration } from 'date-fns'
import { cn } from '@/lib/utils'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { tw } from '@/utils/tailwind'
import { SECONDS_IN_YEAR, secondsToDuration } from '../../../utils/time'

const YEARLY_PRICE_STYLE = {
  citrine: tw`text-ens-citrine-500 bg-ens-citrine-100`,
  peridot: tw`text-ens-peridot-500 bg-ens-peridot-100`,
  garnet: tw`text-ens-garnet-500 bg-ens-garnet-100`,
} as const

export type DurationPresetData = {
  duration: number
  title: MessageDescriptor
  subtitle: MessageDescriptor
  kind: 'default' | 'mostPopular'
  color: keyof typeof YEARLY_PRICE_STYLE
}

export const DurationPresetRow = ({
  data,
  isSelected,
  price,
  basePrice,
  onSelect,
}: {
  data: DurationPresetData
  isLoading: boolean
  /**
   * Fallback amount used when `basePrice` isn't provided (renew flow and
   * non-cooldown registrations, where `basePrice === totalPrice` anyway).
   * Not displayed when `basePrice` is set — see `basePrice` for why.
   */
  price: number | undefined
  /**
   * Base registration cost (no cooldown premium). When provided, this is what
   * the card displays as its "total" and what the `/year` badge derives from.
   * For names in temporary premium, the cooldown is paid once at the cart
   * level (right-hand PaymentCard); folding it into every preset card too
   * would make 1y / 3y / 6y totals look identical (all ≈ $48M) and hide
   * the per-duration cost the user is actually choosing between.
   */
  basePrice?: number | undefined
  isSelected: boolean
  onSelect: () => void
}) => {
  const { _ } = useLingui()

  // Prefer basePrice for the /year display so the cooldown premium (paid
  // once on registration) doesn't get amortized into the per-year rate.
  // Fall back to the legacy total/duration behaviour if basePrice isn't
  // available — preserves the existing UX for non-cooldown names where
  // basePrice === price.
  const yearlyPriceSource = basePrice ?? price
  const yearlyPrice =
    yearlyPriceSource !== undefined
      ? yearlyPriceSource / (data.duration / SECONDS_IN_YEAR)
      : undefined

  // Displayed amount: registration cost for this duration only (no cooldown).
  // For names in cooldown, showing the full total here would make every preset
  // look like ~$48M, hiding the per-duration cost. The cooldown is added
  // once in the right-hand price widget, so it shouldn't be folded into
  // every preset card too. For names without cooldown, basePrice === price
  // so behaviour is unchanged.
  const displayedAmount = basePrice ?? price

  return (
    <button
      aria-pressed={isSelected}
      className={cn(
        'group relative flex w-full cursor-pointer flex-col gap-3 rounded-lg transition-all',
        'border border-[#DEDEDF] bg-neutral-50 px-3 py-4 hover:border-ens-lapis-900 aria-pressed:border-ens-lapis-900 md:px-5 md:py-5',
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center gap-2">
        <span className="font-[425] text-base text-ens-quartz-900 md:text-2xl">
          {_(data.title)}
        </span>
        <span className="font-normal text-ens-quartz-400 text-xs italic md:text-base">
          {_(data.subtitle)}
        </span>
      </div>

      <div className="flex items-center gap-6">
        <span className="font-normal text-base text-ens-quartz-900 leading-none tracking-tighter md:text-2xl">
          {formatDuration(secondsToDuration(data.duration))}
        </span>

        <div
          className={tw(
            YEARLY_PRICE_STYLE[data.color],
            'flex h-5 items-center justify-center rounded-full px-2 font-[450] text-xs',
          )}
        >
          <span>{yearlyPrice ? formatUsd(yearlyPrice) : '...'}/year</span>
        </div>

        <div className="ml-auto flex items-baseline gap-1 md:gap-1.5">
          <span className="font-medium font-mono text-ens-blue-dark text-xl leading-none tracking-tighter md:text-temp-32px">
            {displayedAmount !== undefined ? (
              formatUsd(displayedAmount)
            ) : (
              <span className="animate-pulse">$...</span>
            )}
          </span>
          <span className="font-normal text-[#A0A4A6] text-xs leading-none tracking-tight md:text-base">
            <Trans>total</Trans>
          </span>
        </div>
      </div>

      {data.kind === 'mostPopular' && (
        <div className="-top-2 -left-1 absolute flex h-5 items-center justify-center rounded-full bg-ens-lapis-900 px-2">
          <span className="font-[450] text-white text-xs">
            <Trans>Most popular</Trans>
          </span>
        </div>
      )}
    </button>
  )
}
