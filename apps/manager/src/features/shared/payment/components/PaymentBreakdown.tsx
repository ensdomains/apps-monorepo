import { Trans } from '@lingui/react/macro'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import type { PaymentFlow, PaymentFundingSummary } from '../payment.types'
import { getPaymentBreakdownFigures } from '../utils/paymentBreakdownFigures'
import { AccountCreditRow } from './AccountCreditRow'

export const PaymentBreakdown = ({
  funding,
  isQuoting = false,
  flow = 'registration',
}: {
  readonly funding: PaymentFundingSummary | undefined
  readonly isQuoting?: boolean
  readonly flow?: PaymentFlow
}) => {
  if (!funding) {
    if (!isQuoting) return null
    return (
      <div
        aria-busy
        aria-label="Calculating price breakdown"
        className="w-full animate-pulse space-y-4"
        role="status"
      >
        <div className="h-5 rounded bg-ens-quartz-75" />
        <div className="h-5 rounded bg-ens-quartz-75" />
      </div>
    )
  }
  const figures = getPaymentBreakdownFigures(funding)

  return (
    <dl className="flex w-full flex-col gap-4 text-ens-gray">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <dt>
          {flow === 'renewal' ? (
            <Trans>Renewal total</Trans>
          ) : (
            <Trans>Registration total</Trans>
          )}
        </dt>
        <dd className="whitespace-nowrap tabular-nums">
          {flow === 'renewal' && (
            <span className="text-ens-quartz-500">
              <Trans>up to</Trans>{' '}
            </span>
          )}
          {formatUsd(figures.registration + figures.networkFee)}
        </dd>
      </div>
      {figures.credit > 0 && (
        <AccountCreditRow
          credit={figures.credit}
          isLoading={funding.isLoading}
          label={
            flow === 'renewal' ? (
              <Trans>Available balance applied</Trans>
            ) : undefined
          }
        />
      )}
      <div className="flex items-baseline justify-between gap-4 border-ens-quartz-200 border-t pt-4 font-medium">
        <dt>
          <Trans>Due from your wallet</Trans>
        </dt>
        <dd className="whitespace-nowrap tabular-nums">
          {isQuoting ? (
            <span
              aria-busy
              aria-label="Calculating total"
              className="inline-block h-5 w-20 animate-pulse rounded bg-ens-quartz-75"
              role="status"
            />
          ) : (
            <>
              {flow === 'renewal' && figures.walletDebit > 0 && (
                <span className="text-ens-quartz-500">
                  <Trans>up to</Trans>{' '}
                </span>
              )}
              {formatUsd(figures.walletDebit)}
            </>
          )}
        </dd>
      </div>
    </dl>
  )
}
