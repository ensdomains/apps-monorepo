import { useLingui } from '@lingui/react/macro'
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
  /** A reason this method can't pay yet, under the fee. */
  readonly warning?: React.ReactNode
}

/** A selectable payment row: token icon, name and fee, balance. */
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
  warning,
}: PaymentMethodRowProps) => {
  const { t } = useLingui()

  return (
    <div
      className={cn(
        'relative flex w-full items-start justify-between gap-3 rounded border border-transparent p-3 text-left',
        isSelected && 'border-ens-lapis-900',
      )}
      data-slot="payment-method-row"
    >
      <button
        aria-label={selectLabel}
        aria-pressed={isSelected}
        className="absolute inset-0 z-0 rounded outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ens-blue focus-visible:ring-offset-2 enabled:cursor-pointer enabled:hover:bg-black/[0.025] disabled:cursor-not-allowed"
        disabled={!isAvailable}
        onClick={onSelect}
        type="button"
      />

      <span className="pointer-events-none relative z-10 flex min-w-0 items-start gap-2">
        {icon}
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-ens-quartz-900 text-sm uppercase">
            {name}
          </span>
          {(fee !== undefined || isFeeLoading) && (
            <span
              className={cn(
                'flex min-w-0 items-center gap-0.5 text-ens-quartz-500 text-xs',
                isFeeLoading && 'animate-pulse',
              )}
            >
              <span className="truncate">{fee ?? '—'}</span>
              {feeTooltip && (
                <Tooltip>
                  <TooltipTrigger
                    aria-label={t`What is the network fee?`}
                    className="pointer-events-auto relative z-20 flex shrink-0 items-center text-ens-quartz-350"
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
          {warning && (
            <span className="flex items-center gap-0.5 text-ens-signal-danger-800 text-xs">
              <MSymbol
                aria-hidden="true"
                className="ms-opsz-16 ms-wght-400 text-ens-signal-danger-500"
                symbol="flash_off"
              />
              {warning}
            </span>
          )}
        </span>
      </span>

      <span className="pointer-events-none relative z-10 flex shrink-0 flex-col items-end">
        <span
          className={cn(
            'text-right text-[15px] leading-[22px]',
            isInsufficient
              ? 'text-ens-signal-danger-800'
              : 'text-ens-quartz-900',
          )}
        >
          {amount}
        </span>
        <span className="text-ens-quartz-400 text-xs">{amountLabel}</span>
      </span>
    </div>
  )
}
