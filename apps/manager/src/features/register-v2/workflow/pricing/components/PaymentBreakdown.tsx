import { Trans } from '@lingui/react/macro'
import { getPaymentBreakdownFigures } from '../lib/paymentBreakdownFigures'
import { AccountCreditRow } from './AccountCreditRow'
import { PaymentBreakdownRow } from './PaymentBreakdownRow'
import type { RegistrationFundingSummary } from './TokenPickerContent'

/**
 * The inherited credit explanation above the payment methods. Without a
 * positive account credit the headline already contains the whole price.
 */
export const PaymentBreakdown = ({
  funding,
  isQuoting = false,
}: {
  readonly funding: RegistrationFundingSummary | undefined
  /** No quote yet: hold the rows' space so they fill in rather than push the options down. */
  readonly isQuoting?: boolean
}) => {
  if (!funding) {
    if (!isQuoting) return null
    return (
      <div aria-busy aria-label="Calculating price breakdown" role="status">
        <PaymentBreakdownRow
          amount={undefined}
          isLoading
          label={<Trans>Name price</Trans>}
        />
        <PaymentBreakdownRow
          amount={undefined}
          isCredit
          isLoading
          label={<Trans>Left from your last attempt</Trans>}
        />
      </div>
    )
  }

  const figures = getPaymentBreakdownFigures(funding)
  // The rounded credit, not the raw balance: a sub-cent balance has no line.
  if (figures.credit <= 0) return null

  return (
    <>
      <PaymentBreakdownRow
        amount={figures.registration}
        isLoading={funding.isLoading}
        label={<Trans>Name price</Trans>}
      />
      <AccountCreditRow credit={figures.credit} isLoading={funding.isLoading} />
    </>
  )
}
