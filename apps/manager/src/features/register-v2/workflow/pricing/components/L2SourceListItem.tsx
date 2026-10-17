import { Trans, useLingui } from '@lingui/react/macro'
import { arbitrumSepolia, baseSepolia, optimismSepolia } from 'viem/chains'
import { coinIcons } from '@/assets/coins'
import { USDCIcon } from '@/components/atoms/StableCoinsIcons'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import type { L2PaymentRow } from '../hooks/useL2Payment'
import { PaymentMethodIcon } from './PaymentMethodIcon'
import { PaymentMethodRow } from './PaymentMethodRow'

const USDC_DECIMALS = 6

const NETWORK_BADGES: Readonly<Record<number, string | undefined>> = {
  [baseSepolia.id]: coinIcons.base,
  [arbitrumSepolia.id]: coinIcons.arb1,
  [optimismSepolia.id]: coinIcons.op,
}

/** A payment row that pays the registration with the wallet's USDC on an L2. */
export const L2SourceListItem = ({
  row,
  networkFee,
  isSelected,
  onSelect,
}: {
  readonly row: L2PaymentRow
  /** What the registration costs on top of the name, paid from here, once quoted. */
  readonly networkFee: number | undefined
  readonly isSelected: boolean
  readonly onSelect: () => void
}) => {
  const { t } = useLingui()
  const { option } = row
  const chainName = option.source.chain.name
  const badge = NETWORK_BADGES[option.source.chain.id]
  // A balance just over what the HCA is sent can still fall short of the fee.
  const isShortOfQuote =
    row.amountInRaw !== undefined &&
    option.balanceRaw !== null &&
    option.balanceRaw < row.amountInRaw

  const error =
    option.status === 'insufficient' || isShortOfQuote ? (
      <Trans>Not enough USDC on {chainName}</Trans>
    ) : option.status === 'unavailable' ? (
      <Trans>Couldn't read your balance on {chainName}</Trans>
    ) : row.hasQuoteFailed ? (
      <Trans>Paying from {chainName} isn't available right now</Trans>
    ) : undefined

  return (
    <PaymentMethodRow
      amount={
        option.balanceRaw === null
          ? '—'
          : formatUsd(decimalBigintToNumber(option.balanceRaw, USDC_DECIMALS))
      }
      amountLabel={<Trans>balance</Trans>}
      error={error}
      fee={
        <Trans>
          {chainName} est. fee: {formatUsd(networkFee ?? Number.NaN)}
        </Trans>
      }
      feeTooltip={
        <Trans>
          What the on-chain transactions that register your name cost, including
          moving the USDC from {chainName}. It is paid there with the name
          price, in two signatures: one to commit, and one to register after the
          short wait. The first time, you also approve USDC on {chainName}.
        </Trans>
      }
      feeTooltipLabel={t`What is the network fee?`}
      icon={
        <PaymentMethodIcon
          icon={<USDCIcon className="size-full" />}
          networkBadge={
            badge ? <img alt="" className="size-full" src={badge} /> : undefined
          }
        />
      }
      isAvailable
      isFeeLoading={row.isQuoteLoading}
      // Selectable while quoting; the action waits for the quote.
      isFunded={option.status === 'available' && !isShortOfQuote}
      isSelected={isSelected}
      name={t`USDC on ${chainName}`}
      onSelect={onSelect}
      selectLabel={t`Select USDC on ${chainName}`}
    />
  )
}
