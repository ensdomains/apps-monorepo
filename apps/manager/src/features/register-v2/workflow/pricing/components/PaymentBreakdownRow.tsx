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
  readonly label: React.ReactNode
  /** Undefined renders an em dash, for a figure still being quoted. */
  readonly amount: number | undefined
  readonly isLoading: boolean
  /** Renders the amount as a deduction. */
  readonly isCredit?: boolean
} & (
  | {
      readonly tooltip: React.ReactNode
      /** Accessible name for the tooltip trigger. */
      readonly tooltipLabel: string
    }
  | { readonly tooltip?: never; readonly tooltipLabel?: never }
)

export const PaymentBreakdownRow = ({
  label,
  amount,
  isLoading,
  isCredit = false,
  tooltip,
  tooltipLabel,
}: PaymentBreakdownRowProps) => (
  <div className="w-full rounded-xl bg-ens-quartz-0 p-4">
    <div
      className={tw(
        'flex w-full items-start justify-between gap-2',
        'text-base text-ens-quartz-900',
        isLoading && 'animate-pulse',
      )}
    >
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <span className="tabular-nums">
          {amount === undefined
            ? '—'
            : `${isCredit ? '-' : ''}${formatUsd(amount)}`}
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
