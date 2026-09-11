import { Trans } from '@lingui/react/macro'
import { getPaymentBreakdownFigures } from '../lib/paymentBreakdownFigures'
import { AccountCreditRow } from './AccountCreditRow'
import { NetworkCostRow } from './NetworkCostRow'
import { PaymentBreakdownRow } from './PaymentBreakdownRow'
import type { RegistrationFundingSummary } from './TokenPickerContent'

/**
 * The itemised cost above the token list. The rent only appears beside a
 * credit, where the subtraction has to be checkable; on its own it is implied
 * by the headline, which is how the sheet has always read.
 */
export const PaymentBreakdown = ({
  funding,
  isQuoting,
}: {
  readonly funding: RegistrationFundingSummary | undefined
  /** The budget quote is still in flight; hold the network-cost row's space. */
  readonly isQuoting: boolean
}) => {
  if (!funding) return isQuoting ? <NetworkCostRow isLoading /> : null

  const figures = getPaymentBreakdownFigures(funding)
  // The rounded credit, not the raw balance: a sub-cent balance has no line.
  const hasCredit = figures.credit > 0

  return (
    <>
      {hasCredit && (
        <PaymentBreakdownRow
          amount={figures.registration}
          isLoading={funding.isLoading}
          label={<Trans>Name price</Trans>}
        />
      )}
      <NetworkCostRow
        isLoading={funding.isLoading}
        networkFee={figures.networkFee}
      />
      {hasCredit && (
        <AccountCreditRow
          credit={figures.credit}
          isLoading={funding.isLoading}
        />
      )}
    </>
  )
}
