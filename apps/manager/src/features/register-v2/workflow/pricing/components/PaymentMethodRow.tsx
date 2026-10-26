import { match } from 'ts-pattern'
import { MSymbol } from '@/components/ui/material-symbol'
import { cn } from '@/lib/utils'

export type PaymentMethodRowProps = {
  readonly name: string
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
}

/** A selectable payment card: radio, name and fee, balance. */
export const PaymentMethodRow = ({
  name,
  amount,
  amountLabel,
  selectLabel,
  isAvailable,
  isInsufficient = false,
  isSelected,
  onSelect,
  fee,
  isFeeLoading = false,
}: PaymentMethodRowProps) => {
  const isDisabled = !isAvailable
  const hasFee = fee !== undefined || isFeeLoading

  return (
    <div
      className={cn(
        'relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 rounded-lg border p-3 text-left',
        isSelected
          ? 'border-ens-blue bg-ens-blue-light/30'
          : 'border-ens-quartz-100',
      )}
      data-slot="payment-method-row"
    >
      <button
        aria-label={selectLabel}
        aria-pressed={isSelected}
        className="absolute inset-0 z-0 rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ens-blue focus-visible:ring-offset-2 enabled:cursor-pointer enabled:hover:bg-black/[0.025] disabled:cursor-not-allowed"
        disabled={isDisabled}
        onClick={onSelect}
        type="button"
      />

      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none relative z-10 mt-0.5 flex size-4 items-center justify-center rounded-full border',
          isSelected
            ? 'border-ens-blue bg-ens-blue text-white'
            : 'border-ens-quartz-350',
        )}
      >
        {isSelected && (
          <MSymbol className="ms-opsz-20 ms-wght-600 text-xs" symbol="check" />
        )}
      </span>

      <span className="pointer-events-none relative z-10 flex min-w-0 flex-col self-start">
        <span className="font-medium text-ens-quartz-900 text-sm leading-tight">
          {name}
        </span>
        {hasFee && (
          <span
            className={cn(
              'mt-1 truncate text-ens-quartz-400 text-xs leading-none',
              isFeeLoading && 'animate-pulse',
            )}
          >
            {fee ?? '—'}
          </span>
        )}
      </span>

      <span className="pointer-events-none relative z-10 flex min-w-max flex-col items-end self-start">
        <span
          className={cn(
            'text-right text-sm tabular-nums leading-tight',
            match({ isInsufficient, isDisabled })
              .with({ isInsufficient: true }, () => 'text-ens-error')
              .with({ isDisabled: true }, () => 'text-ens-quartz-350')
              .otherwise(() => 'text-ens-quartz-900'),
          )}
        >
          {amount}
        </span>
        <span className="mt-1 text-ens-quartz-400 text-xs leading-none">
          {amountLabel}
        </span>
      </span>
    </div>
  )
}
