import { Trans, useLingui } from '@lingui/react/macro'
import { PaymentBreakdownRow } from './PaymentBreakdownRow'

/**
 * What the registration costs, line by line, and what the last attempt left
 * behind to set against it. The two charges sit on white cards; the deduction
 * sits beneath them, muted, so cost and funding read as different things.
 *
 * Every line it can show is mounted for as long as the sheet is open. A quote
 * that is slow, refetched or refused changes the figures, never the shape: the
 * sheet re-flowing under the user is what the old render read as.
 */
export const PaymentBreakdown = ({
  registration,
  networkFee,
  leftover,
  isFeeUnavailable = false,
}: {
  /** Undefined while the price is still loading. */
  readonly registration: number | undefined
  /** Undefined while the budget is still being quoted. */
  readonly networkFee: number | undefined
  /** Zero hides the deduction line. */
  readonly leftover: number
  /** The quote failed: the line stays, with the reason in its tooltip. */
  readonly isFeeUnavailable?: boolean
}) => {
  const { t } = useLingui()

  return (
    <div className="flex w-full flex-col gap-2">
      <PaymentBreakdownRow
        amount={registration}
        label={<Trans>Name price</Trans>}
      />
      <PaymentBreakdownRow
        amount={networkFee}
        label={<Trans>Network fee</Trans>}
        tooltip={
          isFeeUnavailable ? (
            <Trans>
              We could not estimate the network fee. It covers the two on-chain
              transactions that register your name, is collected together with
              the name price in the same approval, and is quoted again before
              you sign.
            </Trans>
          ) : (
            <Trans>
              An estimate of what the two on-chain transactions that register
              your name will cost. It is collected together with the name price,
              in the same approval.
            </Trans>
          )
        }
        tooltipLabel={t`What is the network fee?`}
      />
      {leftover > 0 && (
        <PaymentBreakdownRow
          amount={leftover}
          isDeduction
          label={<Trans>Left from your last attempt</Trans>}
          tooltip={
            <Trans>
              Registrations are funded for their quoted maximum cost and only
              the actual cost is spent, so an earlier attempt can leave a little
              behind. It is applied to this one.
            </Trans>
          }
          tooltipLabel={t`Why is there money left from your last attempt?`}
        />
      )}
    </div>
  )
}
