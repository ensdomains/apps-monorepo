import { formatGasEth } from '@ens-apps/utils/formatGasEth'
import { Trans, useLingui } from '@lingui/react/macro'
import { match } from 'ts-pattern'
import ethCoinIcon from '@/assets/icons/eth-coin.svg'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
      icon={
        <PaymentMethodIcon
          icon={<img alt="" className="size-full" src={ethCoinIcon} />}
        />
      }
      isAvailable
      isFeeLoading={row.isQuoteLoading}
      isInsufficient={isEthShortOfFunds(row)}
      isSelected={isSelected}
      name="ETH"
      nameBadge={
        <span className="pointer-events-auto relative z-20 flex items-center gap-1">
          <span className="rounded-sm bg-ens-quartz-100 px-1 font-medium font-mono text-ens-quartz-500 text-xs uppercase">
            <Trans>CoW Protocol</Trans>
          </span>
          <Tooltip>
            <TooltipTrigger
              aria-label={t`What is the ETH swap?`}
              className="flex shrink-0 items-center text-ens-quartz-350"
              type="button"
            >
              <MSymbol className="ms-opsz-16 ms-wght-400" symbol="info" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-center">
              <Trans>
                CoW Protocol solvers exchange your ETH and deliver the USDC this
                registration needs directly to your ENS smart account.
              </Trans>
            </TooltipContent>
          </Tooltip>
        </span>
      }
      onSelect={onSelect}
      selectLabel={t`Pay with ETH`}
    />
  )
}
