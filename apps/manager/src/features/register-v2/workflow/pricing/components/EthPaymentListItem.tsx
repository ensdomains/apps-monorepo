import {
  type CowSellToken,
  ETH_SWAP_GAS_RESERVE_MULTIPLIER,
  ethToUsdcRaw,
} from '@ens-apps/transaction-manager'
import { Trans, useLingui } from '@lingui/react/macro'
import { match } from 'ts-pattern'
import { formatUnits } from 'viem'
import ethCoinIcon from '@/assets/icons/eth-coin.svg'
import { PaymentMethodIcon } from './PaymentMethodIcon'
import { PaymentMethodRow } from './PaymentMethodRow'

/** Paying the registration with ETH through CoW Protocol's EthFlow. */
export type EthPaymentRow = Readonly<{
  /**
   * The most ETH (wei) EthFlow escrows for the exact USDC delivery.
   */
  chargeRaw: bigint | undefined
  /** The wallet's ETH (wei), once read. */
  balanceRaw: bigint | undefined
  /** ETH (wei) the swap step keeps back for gas on top of the swap. */
  gasReserveRaw: bigint
  /** Chainlink ETH/USD (8 decimals), present only for native ETH. */
  ethUsdRaw?: bigint
  isQuoteLoading: boolean
  hasQuoteFailed: boolean
}>

/** Selecting ETH, and what paying with it asks of the wallet. */
export type EthPaymentProps = Readonly<{
  row: EthPaymentRow
  isSelected: boolean
  onSelect: () => void
  onFallbackSelect: () => void
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

export const getEthSelectionMessage = (
  row: EthPaymentRow,
  symbol = 'this token',
) =>
  match(row)
    .when(isEthShortOfFunds, () => (
      <Trans>Not enough {symbol} in your wallet.</Trans>
    ))
    .with({ hasQuoteFailed: true }, () => (
      <Trans>Paying with {symbol} isn't available right now.</Trans>
    ))
    .otherwise(() => undefined)

/** The native EthFlow transaction's estimated gas in USDC. */
export const getEthSwapGasUsdcRaw = (row: EthPaymentRow | undefined) =>
  row?.ethUsdRaw === undefined
    ? 0n
    : ethToUsdcRaw(
        row.gasReserveRaw / ETH_SWAP_GAS_RESERVE_MULTIPLIER,
        row.ethUsdRaw,
      )

export const EthPaymentListItem = ({
  token,
  row,
  isSelected,
  onSelect,
}: {
  readonly token: CowSellToken & { logoURI?: string }
  readonly row: EthPaymentRow
  readonly isSelected: boolean
  readonly onSelect: () => void
}) => {
  const { t } = useLingui()
  const formatAmount = (value: bigint) =>
    new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 }).format(
      Number(formatUnits(value, token.decimals)),
    )
  return (
    <PaymentMethodRow
      amount={
        row.balanceRaw === undefined
          ? '—'
          : `${formatAmount(row.balanceRaw)} ${token.symbol}`
      }
      amountLabel={<Trans>balance</Trans>}
      fee={
        row.chargeRaw === undefined
          ? undefined
          : t`Uses up to ${formatAmount(row.chargeRaw)} ${token.symbol}`
      }
      icon={
        <PaymentMethodIcon
          icon={
            token.logoURI ? (
              <img
                alt=""
                className="size-full rounded-full"
                src={token.logoURI}
              />
            ) : token.isNative ? (
              <img alt="" className="size-full" src={ethCoinIcon} />
            ) : (
              <span className="flex size-full items-center justify-center rounded-full bg-ens-quartz-100 font-semibold text-[10px] text-ens-quartz-500">
                {token.symbol.slice(0, 3)}
              </span>
            )
          }
        />
      }
      isAvailable
      isFeeLoading={row.isQuoteLoading}
      isInsufficient={isEthShortOfFunds(row)}
      isSelected={isSelected}
      name={token.symbol}
      onSelect={onSelect}
      selectLabel={t`Pay with ${token.symbol}`}
    />
  )
}
