import { Trans, useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { match } from 'ts-pattern'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import type { PaymentBreakdownFigures } from '../lib/paymentBreakdownFigures'
import type { PaymentReceiptState } from '../lib/paymentReceiptFigures'

const Amount = ({
  state,
  value = Number.NaN,
  isEstimate = false,
  isDeduction = false,
}: {
  readonly state: PaymentReceiptState['status']
  readonly value?: number
  readonly isEstimate?: boolean
  readonly isDeduction?: boolean
}) =>
  match(state)
    .with('loading', () => (
      <span
        aria-hidden="true"
        className="inline-block h-5 w-28 rounded bg-ens-quartz-75"
      />
    ))
    .with('unavailable', () => (
      <span className="text-ens-quartz-900 text-xl">—</span>
    ))
    .with('ready', () => {
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

const ExistingBalanceLabel = () => {
  const { t } = useLingui()

  return (
    <span className="flex items-center gap-1">
      <Trans>Existing balance</Trans>
      <Tooltip>
        <TooltipTrigger
          aria-label={t`Where did this come from?`}
          className="flex items-center text-ens-quartz-350"
          type="button"
        >
          <MSymbol className="ms-opsz-20 ms-wght-400" symbol="info" />
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-center">
          <Trans>
            Your own USDC, left in your ENS account by a payment you started
            earlier. It is spent first, so your wallet pays the rest. Nothing
            extra is charged for it.
          </Trans>
        </TooltipContent>
      </Tooltip>
    </span>
  )
}

/** Registration itemises the quote; other callers keep the combined total. */
export const PaymentReceipt = ({
  state,
  totalLabel,
  isEstimate,
  hasExistingBalance,
  registrationBreakdown,
}: {
  readonly state: PaymentReceiptState
  /** The name price's label in the breakdown, or the combined total's label. */
  readonly totalLabel: ReactNode
  readonly isEstimate: boolean
  /** From the latest figures, so a re-quote keeps the three-row layout. */
  readonly hasExistingBalance: boolean
  readonly registrationBreakdown?: Pick<
    PaymentBreakdownFigures,
    'registration' | 'networkFee'
  >
}) => {
  const { t } = useLingui()
  const figures = state.status === 'ready' ? state.figures : undefined

  return (
    <section
      aria-busy={state.status === 'loading'}
      aria-label={t`Payment summary`}
      className="w-full"
    >
      {registrationBreakdown || hasExistingBalance ? (
        <dl className="flex flex-col gap-6">
          <Row label={totalLabel}>
            <Amount
              isEstimate={!registrationBreakdown && isEstimate}
              state={state.status}
              value={registrationBreakdown?.registration ?? figures?.total}
            />
          </Row>
          {registrationBreakdown && (
            <Row label={<Trans>Estimated network fee</Trans>}>
              <Amount
                state={state.status}
                value={registrationBreakdown.networkFee}
              />
            </Row>
          )}
          {hasExistingBalance && (
            <Row label={<ExistingBalanceLabel />}>
              <Amount
                isDeduction
                state={state.status}
                value={figures?.applied}
              />
            </Row>
          )}
          <hr className="border-ens-quartz-100" />
          <Row label={<Trans>You pay</Trans>}>
            <Amount
              isEstimate={isEstimate}
              state={state.status}
              value={figures?.due}
            />
          </Row>
        </dl>
      ) : (
        <dl>
          <Row label={<Trans>Total</Trans>}>
            <Amount
              isEstimate={isEstimate}
              state={state.status}
              value={figures?.due}
            />
          </Row>
        </dl>
      )}
    </section>
  )
}
