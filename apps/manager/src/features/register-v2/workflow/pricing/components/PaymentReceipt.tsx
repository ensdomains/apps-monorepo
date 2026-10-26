import { Trans, useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { match } from 'ts-pattern'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import type {
  PaymentReceiptFigures,
  PaymentReceiptState,
} from '../lib/paymentReceiptFigures'

const InfoTooltip = ({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactNode
}) => (
  <Tooltip>
    <TooltipTrigger
      aria-label={label}
      className="flex items-center text-ens-quartz-400"
      type="button"
    >
      <MSymbol className="ms-opsz-20 ms-wght-400" symbol="info" />
    </TooltipTrigger>
    <TooltipContent className="max-w-64 text-center">{children}</TooltipContent>
  </Tooltip>
)

const Amount = ({
  state,
  field,
  isEstimate = false,
  isDeduction = false,
}: {
  readonly state: PaymentReceiptState
  readonly field: keyof PaymentReceiptFigures
  readonly isEstimate?: boolean
  readonly isDeduction?: boolean
}) =>
  match(state)
    .with({ status: 'loading' }, () => (
      <span
        aria-hidden="true"
        className="inline-block h-5 w-16 animate-pulse rounded bg-ens-quartz-75"
      />
    ))
    .with({ status: 'unavailable' }, () => <span>—</span>)
    .with({ status: 'ready' }, ({ figures }) => {
      const value = figures[field]
      return (
        <span>
          {isEstimate && value > 0 && (
            <span className="text-ens-quartz-400 text-sm">
              <Trans>up to</Trans>{' '}
            </span>
          )}
          {isDeduction && value > 0 ? `−${formatUsd(value)}` : formatUsd(value)}
        </span>
      )
    })
    .exhaustive()

/** Total, balance applied and wallet due, with one message underneath. */
export const PaymentReceipt = ({
  state,
  totalLabel,
  totalTooltip,
  isEstimate,
  errorMessage,
  shortfall,
}: {
  readonly state: PaymentReceiptState
  readonly totalLabel: ReactNode
  readonly totalTooltip: ReactNode
  readonly isEstimate: boolean
  /** Wins over the shortfall line. */
  readonly errorMessage?: ReactNode
  readonly shortfall?: number | undefined
}) => {
  const { t } = useLingui()
  const message =
    errorMessage ||
    (shortfall === undefined
      ? undefined
      : t`${formatUsd(shortfall)} more needed in your wallet.`)

  return (
    <section
      aria-busy={state.status === 'loading'}
      aria-label={t`Payment summary`}
      className="flex w-full flex-col border-ens-quartz-100 border-t pt-4"
    >
      <dl className="flex flex-col gap-3 text-base text-ens-quartz-500">
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5">
            {totalLabel}
            <InfoTooltip label={t`What does the total include?`}>
              {totalTooltip}
            </InfoTooltip>
          </dt>
          <dd className="text-ens-quartz-900">
            <Amount field="total" isEstimate={isEstimate} state={state} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5">
            <Trans>Available balance applied</Trans>
            <InfoTooltip label={t`Where does this balance come from?`}>
              <Trans>
                Funds left over from your earlier registrations. They are used
                first, so your wallet only pays the rest.
              </Trans>
            </InfoTooltip>
          </dt>
          <dd className="text-ens-quartz-900">
            <Amount field="applied" isDeduction state={state} />
          </dd>
        </div>
        <div
          className={cn(
            'flex items-center justify-between gap-2 border-ens-quartz-100 border-t pt-3',
            'text-ens-quartz-900 text-lg',
          )}
        >
          <dt>
            <Trans>Due from your wallet</Trans>
          </dt>
          <dd>
            <Amount field="due" isEstimate={isEstimate} state={state} />
          </dd>
        </div>
      </dl>
      {message && (
        <p className="mt-3 text-ens-error text-sm" role="alert">
          {message}
        </p>
      )}
    </section>
  )
}
