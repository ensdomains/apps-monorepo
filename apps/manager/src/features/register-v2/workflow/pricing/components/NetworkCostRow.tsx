import { Trans, useLingui } from '@lingui/react/macro'
import { PaymentBreakdownRow } from './PaymentBreakdownRow'

/**
 * The execution cost of the two on-chain legs (commit + register), which the
 * wallet funds up front alongside the rent.
 *
 * Shown because the standalone-HCA route debits `rent + networkFee` under a
 * SINGLE permit — hiding it is what let wallets holding between the rent and
 * the budget clear checkout and then fail the commit simulation.
 */
export const NetworkCostRow = ({
  networkFee,
  isLoading,
}: {
  /** Undefined while the budget is still being quoted. */
  readonly networkFee?: number
  readonly isLoading: boolean
}) => {
  const { t } = useLingui()

  return (
    <PaymentBreakdownRow
      amount={networkFee}
      isLoading={isLoading}
      label={<Trans>Network cost</Trans>}
      tooltip={
        <Trans>
          An estimate of what the two on-chain transactions that register your
          name will cost. It is collected together with the rent, in the same
          approval.
        </Trans>
      }
      tooltipLabel={t`What is the network cost?`}
    />
  )
}
