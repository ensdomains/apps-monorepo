import { match } from 'ts-pattern'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type PaymentMethodRowProps = {
  readonly name: string
  readonly icon: React.ReactNode
  readonly amount: React.ReactNode
  readonly amountLabel: React.ReactNode
  readonly selectLabel: string
  readonly isAvailable: boolean
  /** The balance is known to be short, as opposed to loading or unreadable. */
  readonly isInsufficient?: boolean
  readonly isSelected: boolean
  readonly onSelect: () => void
  readonly fee?: React.ReactNode
  readonly isFeeLoading?: boolean
  readonly feeTooltip?: React.ReactNode
  readonly feeTooltipLabel?: string
  readonly isFeeTooltipOpen?: boolean
}

/** A presentation-only payment option with an intrinsic, responsive grid. */
export const PaymentMethodRow = ({
  name,
  icon,
  amount,
  amountLabel,
  selectLabel,
  isAvailable,
  isInsufficient = false,
  isSelected,
  onSelect,
  fee,
  isFeeLoading = false,
  feeTooltip,
  feeTooltipLabel,
  isFeeTooltipOpen,
}: PaymentMethodRowProps) => {
  const isDisabled = !isAvailable
  const hasFee = fee !== undefined || isFeeLoading

  return (
    <div
      className={cn(
        // The intrinsic grid tracks and Figma #f5f5f5 desktop fill have no exact theme tokens.
        'relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 rounded text-left sm:gap-y-0',
        'px-3 py-2',
        isSelected
          ? 'bg-ens-quartz-75 sm:bg-[#f5f5f5] sm:p-3'
          : 'sm:px-4 sm:py-3',
      )}
      data-slot="payment-method-row"
    >
      {/* The Figma 2.5% hover overlay has no equivalent opacity token. */}
      <button
        aria-label={selectLabel}
        aria-pressed={isSelected}
        className="absolute inset-0 z-0 rounded outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ens-blue focus-visible:ring-offset-2 enabled:cursor-pointer enabled:hover:bg-black/[0.025] disabled:cursor-not-allowed"
        disabled={isDisabled}
        onClick={onSelect}
        type="button"
      />

      <span
        className="pointer-events-none relative z-10 self-start"
        data-slot="payment-method-icon"
      >
        {icon}
      </span>

      <span
        className="pointer-events-none relative z-10 flex min-w-0 flex-col self-start"
        data-slot="payment-method-details"
      >
        <span className="font-medium text-ens-quartz-900 text-sm leading-none">
          {name}
        </span>
        {hasFee && (
          <span
            className={cn(
              // Figma specifies 10px mobile fee copy; Tailwind has no exact text token.
              'mt-1 flex min-w-0 items-center gap-1 whitespace-nowrap text-[10px] text-ens-quartz-400 leading-none sm:text-xs',
              isFeeLoading && 'animate-pulse',
            )}
          >
            <span>{fee ?? '—'}</span>
            {feeTooltip && feeTooltipLabel && (
              <Tooltip open={isFeeTooltipOpen}>
                <TooltipTrigger
                  aria-label={feeTooltipLabel}
                  className="pointer-events-auto relative z-20 flex shrink-0 items-center text-ens-quartz-400"
                  onClick={(event) => event.stopPropagation()}
                  type="button"
                >
                  <MSymbol className="ms-opsz-16 ms-wght-400" symbol="info" />
                </TooltipTrigger>
                <TooltipContent className="max-w-64 text-center">
                  {feeTooltip}
                </TooltipContent>
              </Tooltip>
            )}
          </span>
        )}
      </span>

      <span
        className="pointer-events-none relative z-10 flex min-w-max flex-col items-end self-start"
        data-slot="payment-method-amount"
      >
        <span
          className={cn(
            // Figma specifies 15/22px desktop amount type; no exact typography tokens exist.
            'text-right text-sm tabular-nums leading-none sm:text-[15px] sm:leading-[22px]',
            match({ isInsufficient, isDisabled })
              .with({ isInsufficient: true }, () => 'text-ens-error')
              .with({ isDisabled: true }, () => 'text-ens-quartz-350')
              .otherwise(() => 'text-ens-quartz-900'),
          )}
        >
          {amount}
        </span>
        {/* Figma specifies 10px mobile label copy; Tailwind has no exact text token. */}
        <span className="text-[10px] text-ens-quartz-400 leading-none sm:text-xs">
          {amountLabel}
        </span>
      </span>
    </div>
  )
}
