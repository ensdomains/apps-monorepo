import { formatGasEth } from '@ens-apps/utils/formatGasEth'
import { Trans, useLingui } from '@lingui/react/macro'
import { match } from 'ts-pattern'
import ethereumIcon from '@/assets/icons/ethereum-color.svg'
import { PaymentMethodIcon } from './PaymentMethodIcon'
import { PaymentMethodRow } from './PaymentMethodRow'

/** Paying the registration with the wallet's ETH, swapped into USDC. */
export type EthPaymentRow = Readonly<{
  /**
   * The most ETH (wei) the swap would send, once quoted; unused ETH comes
   * back. `0n` when the wallet already holds the USDC.
   */
  chargeRaw: bigint | undefined
  /** The wallet's ETH (wei), once read. */
  balanceRaw: bigint | undefined
  /** ETH (wei) the swap step keeps back for gas on top of the swap. */
  gasReserveRaw: bigint
  isQuoteLoading: boolean
  hasQuoteFailed: boolean
}>

export const isEthShortOfFunds = ({
  chargeRaw,
  balanceRaw,
  gasReserveRaw,
}: EthPaymentRow) =>
  chargeRaw !== undefined &&
  balanceRaw !== undefined &&
  balanceRaw < chargeRaw + gasReserveRaw

/** The row can pay: quoted, and the wallet holds what it would send. */
export const canPayWithEth = (row: EthPaymentRow) =>
  row.chargeRaw !== undefined &&
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
        row.chargeRaw === undefined ? undefined : (
          <Trans>Swaps up to {formatGasEth(row.chargeRaw)} ETH</Trans>
        )
      }
      feeTooltip={
        <Trans>
          Your wallet swaps ETH for the USDC this registration needs on Uniswap,
          and gets back any ETH the swap does not use. You then approve that
          USDC for the name and network fees as usual.
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
