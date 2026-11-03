import { formatGasEth } from '@ens-apps/utils/formatGasEth'
import { Trans, useLingui } from '@lingui/react/macro'
import { match } from 'ts-pattern'
import ethereumIcon from '@/assets/icons/ethereum-color.svg'
import { PaymentMethodIcon } from './PaymentMethodIcon'
import { PaymentMethodRow } from './PaymentMethodRow'

/** Paying the registration with the wallet's ETH, swapped into USDC. */
export type EthPaymentRow = Readonly<{
  /** The ETH (wei) the wallet would send, once quoted. */
  depositRaw: bigint | undefined
  /** The wallet's ETH (wei), once read. */
  balanceRaw: bigint | undefined
  isQuoteLoading: boolean
  hasQuoteFailed: boolean
}>

export const isEthShortOfFunds = ({ depositRaw, balanceRaw }: EthPaymentRow) =>
  depositRaw !== undefined &&
  balanceRaw !== undefined &&
  balanceRaw < depositRaw

/** The row can pay: quoted, and the wallet holds what it would send. */
export const canPayWithEth = (row: EthPaymentRow) =>
  row.depositRaw !== undefined &&
  !row.isQuoteLoading &&
  !row.hasQuoteFailed &&
  !isEthShortOfFunds(row)

export const getEthSelectionMessage = (row: EthPaymentRow) =>
  match(row)
    .when(isEthShortOfFunds, () => (
      <Trans>Not enough ETH in your wallet.</Trans>
    ))
    .with({ hasQuoteFailed: true }, () => (
      <Trans>Paying with ETH isn't available right now.</Trans>
    ))
    .otherwise(() => undefined)

export const EthPaymentListItem = ({
  row,
  isSelected,
  onSelect,
}: {
  readonly row: EthPaymentRow
  readonly isSelected: boolean
  readonly onSelect: () => void
}) => {
  const { t } = useLingui()
  return (
    <PaymentMethodRow
      amount={
        row.balanceRaw === undefined
          ? '—'
          : `${formatGasEth(row.balanceRaw)} ETH`
      }
      amountLabel={<Trans>balance</Trans>}
      fee={
        row.depositRaw === undefined ? undefined : (
          <Trans>Sends ~{formatGasEth(row.depositRaw)} ETH</Trans>
        )
      }
      feeTooltip={
        <Trans>
          Your wallet sends this ETH to your ENS account, which swaps it for the
          USDC that pays for the name and network fees. Any USDC left over stays
          in your account for your next registration.
        </Trans>
      }
      icon={
        <PaymentMethodIcon
          icon={<img alt="" className="size-full" src={ethereumIcon} />}
        />
      }
      isAvailable
      isFeeLoading={row.isQuoteLoading}
      isInsufficient={isEthShortOfFunds(row)}
      isSelected={isSelected}
      name="ETH"
      onSelect={onSelect}
      selectLabel={t`Pay with ETH`}
    />
  )
}
