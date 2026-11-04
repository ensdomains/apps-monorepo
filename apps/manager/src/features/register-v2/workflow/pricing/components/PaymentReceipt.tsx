import { Trans, useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { match } from 'ts-pattern'
import { formatUnits, parseUnits } from 'viem'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import {
  getNetworkFeeReceiptFigures,
  type PaymentReceiptFigures,
  type PaymentReceiptState,
} from '../lib/paymentReceiptFigures'
import { ExistingBalanceLabel } from './ExistingBalanceLabel'
import { RECEIPT_AMOUNT, RECEIPT_LABEL } from './receiptTypography'

const USDC_DECIMALS = 6

type ShownAmount =
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'ready'; readonly value: number }

const UsdAmount = ({
  amount,
  isEstimate = false,
  isDeduction = false,
}: {
  readonly amount: ShownAmount
  readonly isEstimate?: boolean
  readonly isDeduction?: boolean
}) =>
  match(amount)
    .with({ status: 'loading' }, () => (
      <span
        aria-hidden="true"
        className="inline-block h-5 w-28 rounded bg-ens-quartz-75"
      />
    ))
    .with({ status: 'unavailable' }, () => (
      <span className="text-ens-quartz-900 text-xl">—</span>
    ))
    .with({ status: 'ready' }, ({ value }) => {
      return (
        <span className="flex items-baseline gap-2">
          {isEstimate && value > 0 && (
            <span className="text-base text-ens-quartz-400">
              <Trans>up to</Trans>
            </span>
          )}
          <span className={RECEIPT_AMOUNT}>
            {isDeduction && value > 0
              ? `-${formatUsd(value)}`
              : formatUsd(value)}
          </span>
          <span className={RECEIPT_LABEL}>USD</span>
        </span>
      )
    })
    .exhaustive()

const Amount = ({
  state,
  field,
  ...rest
}: {
  readonly state: PaymentReceiptState
  readonly field: keyof PaymentReceiptFigures
  readonly isEstimate?: boolean
  readonly isDeduction?: boolean
}) => (
  <UsdAmount
    amount={
      state.status === 'ready'
        ? { status: 'ready', value: state.figures[field] }
        : state
    }
    {...rest}
  />
)

const Row = ({
  label,
  children,
}: {
  readonly label: ReactNode
  readonly children: ReactNode
}) => (
  <div className="flex items-baseline justify-between gap-2">
    <dt className={RECEIPT_LABEL}>{label}</dt>
    <dd>{children}</dd>
  </div>
)

/** A single total, or total, existing balance and what the user pays when a balance applies. */
export const PaymentReceipt = ({
  state,
  totalLabel,
  isEstimate,
  hasExistingBalance,
}: {
  readonly state: PaymentReceiptState
  /** The total's label when an existing balance is applied, e.g. "Registration total". */
  readonly totalLabel: ReactNode
  readonly isEstimate: boolean
  /** From the latest figures, so a re-quote keeps the three-row layout. */
  readonly hasExistingBalance: boolean
}) => {
  const { t } = useLingui()

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
          <Row label={<ExistingBalanceLabel />}>
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

/** Registration's receipt: the page's total, the selected method's fee, and what the wallet pays. */
const toUsd = (raw: bigint) => Number(formatUnits(raw, USDC_DECIMALS))

const toUsdcRaw = (usd: number) =>
  parseUnits(usd.toFixed(USDC_DECIMALS), USDC_DECIMALS)

export const NetworkFeeReceipt = ({
  state,
  registrationTotalRaw,
  networkFee,
  extraFeeRaw,
}: {
  /** The quote behind the fee; the total is the page's and is always shown. */
  readonly state: PaymentReceiptState
  /** `undefined` while the price or the account balance loads. */
  readonly registrationTotalRaw: bigint | undefined
  /** The selected method's fee, before any existing balance; `undefined` until quoted. */
  readonly networkFee: number | undefined
  /** Paid on top of the wallet debit, such as an ETH swap's gas. */
  readonly extraFeeRaw: bigint
}) => {
  const { t } = useLingui()
  const figures =
    state.status === 'ready' &&
    registrationTotalRaw !== undefined &&
    networkFee !== undefined
      ? getNetworkFeeReceiptFigures({
          registrationTotalRaw,
          networkFeeRaw: toUsdcRaw(networkFee),
          walletDebitRaw: toUsdcRaw(state.figures.due),
          extraFeeRaw,
        })
      : undefined
  const pending: ShownAmount =
    state.status === 'loading'
      ? { status: 'loading' }
      : { status: 'unavailable' }
  const shown = (field: 'networkFeeRaw' | 'dueRaw'): ShownAmount =>
    figures ? { status: 'ready', value: toUsd(figures[field]) } : pending

  return (
    <section
      aria-busy={state.status === 'loading'}
      aria-label={t`Payment summary`}
      className="w-full"
    >
      <dl className="flex flex-col gap-4">
        <Row label={<Trans>Registration total</Trans>}>
          <UsdAmount
            amount={
              registrationTotalRaw === undefined
                ? { status: 'loading' }
                : {
                    status: 'ready',
                    value: toUsd(
                      figures?.registrationTotalRaw ?? registrationTotalRaw,
                    ),
                  }
            }
          />
        </Row>
        <Row label={<Trans>Estimated network fee</Trans>}>
          <UsdAmount amount={shown('networkFeeRaw')} />
        </Row>
        {figures && figures.existingBalanceRaw > 0n && (
          <Row label={<ExistingBalanceLabel />}>
            <UsdAmount
              amount={{
                status: 'ready',
                value: toUsd(figures.existingBalanceRaw),
              }}
              isDeduction
            />
          </Row>
        )}
        <hr className="border-ens-quartz-100" />
        <Row label={<Trans>You pay</Trans>}>
          <UsdAmount amount={shown('dueRaw')} />
        </Row>
      </dl>
    </section>
  )
}
