import { Trans, useLingui } from '@lingui/react/macro'
import { PaymentBreakdownRow } from './PaymentBreakdownRow'

/**
 * USDC the ENS account is already carrying, deducted from what the wallet
 * pays. A line rather than a sentence: the sheet quotes a wallet balance too,
 * and prose about a second balance reads as the first one contradicting itself.
 */
export const AccountCreditRow = ({
  credit,
  isLoading,
}: {
  readonly credit: number
  readonly isLoading: boolean
}) => {
  const { t } = useLingui()

  return (
    <PaymentBreakdownRow
      amount={credit}
      isCredit
      isLoading={isLoading}
      label={<Trans>Already in your ENS account</Trans>}
      tooltip={
        <Trans>
          USDC left in your ENS account by an earlier registration. It is spent
          first, so your wallet only covers the rest.
        </Trans>
      }
      tooltipLabel={t`Why is there a credit?`}
    />
  )
}
