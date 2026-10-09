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
}: {
  readonly funding: RegistrationFundingSummary | undefined
}) => {
  if (!funding) return null

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
