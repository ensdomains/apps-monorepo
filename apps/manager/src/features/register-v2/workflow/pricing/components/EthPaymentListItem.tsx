import {
  ETH_SWAP_GAS_RESERVE_MULTIPLIER,
  ethToUsdcRaw,
} from '@ens-apps/transaction-manager'
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
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { PaymentMethodIcon } from './PaymentMethodIcon'
import { PaymentMethodRow } from './PaymentMethodRow'

const USDC_DECIMALS = 6

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
  /** The Chainlink ETH/USD price (8 decimals), once read. */
  ethUsdRaw: bigint | undefined
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

const weiToUsd = (wei: bigint, ethUsd: bigint) =>
  decimalBigintToNumber(ethToUsdcRaw(wei, ethUsd), USDC_DECIMALS)

/** The swap's own gas in USD: one estimate, not the doubled reserve kept back for it. */
export const getEthSwapGasUsd = (row: EthPaymentRow | undefined) =>
  row?.ethUsdRaw === undefined
    ? 0
    : weiToUsd(
        row.gasReserveRaw / ETH_SWAP_GAS_RESERVE_MULTIPLIER,
        row.ethUsdRaw,
      )

export const getEthSelectionMessage = (row: EthPaymentRow) =>
  match(row)
    .when(isEthShortOfFunds, () => (
      <Trans>You do not have enough ETH for this transaction.</Trans>
    ))
    .with({ hasQuoteFailed: true }, () => (
      <Trans>Paying with ETH isn't available right now.</Trans>
    ))
    .otherwise(() => undefined)

/** The wallet's ETH in USD, or in ETH until the price is read. */
const getShownBalance = ({ balanceRaw, ethUsdRaw }: EthPaymentRow) => {
  if (balanceRaw === undefined) return '—'
  if (ethUsdRaw === undefined) return `${formatGasEth(balanceRaw)} ETH`
  return formatUsd(weiToUsd(balanceRaw, ethUsdRaw))
}

const SwapBadge = () => {
  const { t } = useLingui()
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={t`What is the ETH swap?`}
        className="pointer-events-auto relative z-20 flex items-center gap-0.5 rounded-xs bg-neutral-100 px-1 font-medium text-ens-quartz-500 text-xs"
        type="button"
      >
        <Trans>Swaps to USDC</Trans>
        {/* Figma's badge icon is 10px, below the theme's smallest text size. */}
        <MSymbol
          aria-hidden="true"
          className="ms-opsz-20 ms-wght-400 text-[10px]"
          symbol="info"
        />
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-center">
        <Trans>
          Your wallet swaps ETH for the USDC this registration needs on Uniswap,
          and gets back any ETH the swap does not use.
        </Trans>
      </TooltipContent>
    </Tooltip>
  )
}

export const EthPaymentListItem = ({
  row,
  networkFee,
  isSelected,
  onSelect,
}: {
  readonly row: EthPaymentRow
  /** The registration's own network fee; the swap's gas comes on top. */
  readonly networkFee: number | undefined
  readonly isSelected: boolean
  readonly onSelect: () => void
}) => {
  const { t } = useLingui()

  return (
    <PaymentMethodRow
      amount={getShownBalance(row)}
      amountLabel={<Trans>available</Trans>}
      fee={
        row.chargeRaw === undefined ? undefined : (
          <span className="flex flex-col">
            <span>
              <Trans>Swaps up to {formatGasEth(row.chargeRaw)} ETH</Trans>
            </span>
            {networkFee !== undefined && (
              <span>
                <Trans>
                  Est. fee: {formatUsd(networkFee + getEthSwapGasUsd(row))}
                </Trans>
              </span>
            )}
          </span>
        )
      }
      icon={
        <PaymentMethodIcon
          icon={<img alt="" className="size-full" src={ethCoinIcon} />}
        />
      }
      isAvailable
      isFeeLoading={row.isQuoteLoading}
      isSelected={isSelected}
      name="ETH"
      nameBadge={<SwapBadge />}
      onSelect={onSelect}
      selectLabel={t`Pay with ETH`}
    />
  )
}
