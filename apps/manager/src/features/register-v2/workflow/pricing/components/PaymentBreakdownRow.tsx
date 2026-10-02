import type { ReactNode } from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { tw } from '@/utils/tailwind'

/**
 * One line of the payment breakdown, as its own white card inside the name
 * card, per design (node 3867:125909).
 */
type PaymentBreakdownRowProps = {
  readonly label: ReactNode
  /**
   * Undefined renders an em dash. That IS the pending state: the quote is
   * re-run often enough that animating the line reads as the sheet flickering.
   */
  readonly amount: number | undefined
  /**
   * Renders the line as a deduction: money already paid in, set against the
   * charges above it. Muted and off the white card so it does not read as
   * another thing being charged.
   */
  readonly isDeduction?: boolean
} & (
  | {
      readonly tooltip: ReactNode
      /** Accessible name for the tooltip trigger. */
      readonly tooltipLabel: string
    }
  | { readonly tooltip?: never; readonly tooltipLabel?: never }
)

export const PaymentBreakdownRow = ({
  label,
  amount,
  isDeduction = false,
  tooltip,
  tooltipLabel,
}: PaymentBreakdownRowProps) => (
  <div
    className={tw(
      'w-full rounded-xl',
      isDeduction ? 'px-4 pt-1 pb-1.5' : 'bg-ens-quartz-0 px-4 py-3',
    )}
  >
    <div
      className={tw(
        'flex w-full items-start justify-between gap-2',
        isDeduction
          ? 'text-ens-quartz-500 text-sm'
          : 'text-base text-ens-quartz-900',
      )}
    >
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <span className="tabular-nums">
          {amount === undefined
            ? '—'
            : `${isDeduction ? '-' : ''}${formatUsd(amount)}`}
        </span>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger
              aria-label={tooltipLabel}
              className="flex items-center text-ens-quartz-500"
              type="button"
            >
              <MSymbol className="ms-opsz-20 ms-wght-400" symbol="info" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-center">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    </div>
  </div>
)
