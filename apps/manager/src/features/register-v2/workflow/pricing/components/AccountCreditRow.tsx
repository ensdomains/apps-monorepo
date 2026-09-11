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
      label={<Trans>Left from your last attempt</Trans>}
      tooltip={
        <Trans>
          Money left in your ENS account from a registration you started
          earlier. It is used first, so your wallet pays the rest.
        </Trans>
      }
      tooltipLabel={t`Where did this come from?`}
    />
  )
}
