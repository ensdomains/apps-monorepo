import { Trans, useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { match } from 'ts-pattern'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import type {
  PaymentReceiptFigures,
  PaymentReceiptState,
} from '../lib/paymentReceiptFigures'

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
        className="inline-block h-5 w-28 animate-pulse rounded bg-ens-quartz-100"
      />
    ))
    .with({ status: 'unavailable' }, () => (
      <span className="text-ens-quartz-900 text-xl">—</span>
    ))
    .with({ status: 'ready' }, ({ figures }) => {
      const value = figures[field]
      return (
        <span className="flex items-baseline gap-2">
          {isEstimate && value > 0 && (
            <span className="text-base text-ens-quartz-400">
              <Trans>up to</Trans>
            </span>
          )}
          <span className="text-ens-quartz-900 text-xl leading-none">
            {isDeduction && value > 0
              ? `-${formatUsd(value)}`
              : formatUsd(value)}
          </span>
          <span className="text-ens-quartz-400 text-lg leading-none">USD</span>
        </span>
      )
    })
    .exhaustive()

const Row = ({
  label,
  children,
}: {
  readonly label: ReactNode
  readonly children: ReactNode
}) => (
  <div className="flex items-baseline justify-between gap-2">
    <dt className="text-ens-quartz-400 text-lg leading-none">{label}</dt>
    <dd>{children}</dd>
  </div>
)

/** A single total, or total, existing balance and what the user pays when a balance applies. */
export const PaymentReceipt = ({
  state,
  totalLabel,
  isEstimate,
}: {
  readonly state: PaymentReceiptState
  /** The total's label when an existing balance is applied, e.g. "Registration total". */
  readonly totalLabel: ReactNode
  readonly isEstimate: boolean
}) => {
  const { t } = useLingui()
  const hasExistingBalance =
    state.status === 'ready' && state.figures.applied > 0

  return (
    <section
      aria-busy={state.status === 'loading'}
      aria-label={t`Payment summary`}
      className="w-full"
    >
      {hasExistingBalance ? (
        <dl className="flex flex-col gap-6">
          <Row label={totalLabel}>
            <Amount field="total" isEstimate={isEstimate} state={state} />
          </Row>
          <Row label={<Trans>Existing balance</Trans>}>
            <Amount field="applied" isDeduction state={state} />
          </Row>
          <hr className="border-ens-quartz-100" />
          <Row label={<Trans>You pay</Trans>}>
            <Amount field="due" isEstimate={isEstimate} state={state} />
          </Row>
        </dl>
      ) : (
        <dl>
          <Row label={<Trans>Total</Trans>}>
            <Amount field="due" isEstimate={isEstimate} state={state} />
          </Row>
        </dl>
      )}
    </section>
  )
}
