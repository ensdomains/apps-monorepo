import { Trans, useLingui } from '@lingui/react/macro'
import { match, P } from 'ts-pattern'
import { arbitrumSepolia, baseSepolia, optimismSepolia } from 'viem/chains'
import { coinIcons } from '@/assets/coins'
import { USDCIcon } from '@/components/atoms/StableCoinsIcons'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import type { L2PaymentRow } from '../hooks/useL2Payment'
import { getWalletShortfall } from '../lib/paymentReceiptFigures'
import { PaymentMethodIcon } from './PaymentMethodIcon'
import { PaymentMethodRow } from './PaymentMethodRow'

const USDC_DECIMALS = 6

const NETWORK_BADGES: Readonly<Record<number, string | undefined>> = {
  [baseSepolia.id]: coinIcons.base,
  [arbitrumSepolia.id]: coinIcons.arb1,
  [optimismSepolia.id]: coinIcons.op,
}

// A balance just over what the HCA is sent can still fall short of the fee.
const isShortOfQuote = ({ option, amountInRaw }: L2PaymentRow) =>
  amountInRaw !== undefined &&
  option.balanceRaw !== null &&
  option.balanceRaw < amountInRaw

export const isL2ShortOfFunds = (row: L2PaymentRow) =>
  row.option.status === 'insufficient' || isShortOfQuote(row)

/** The highest quoted L2 charge, standing in for chains that cannot be quoted. */
export const getEstimatedL2AmountIn = (rows: readonly L2PaymentRow[]) =>
  rows.reduce<bigint | undefined>(
    (max, { amountInRaw }) =>
      amountInRaw !== undefined && (max === undefined || amountInRaw > max)
        ? amountInRaw
        : max,
    undefined,
  )

export const getL2SelectionMessage = (
  row: L2PaymentRow,
  required: number | undefined,
  estimatedAmountInRaw: bigint | undefined,
) => {
  const chainName = row.option.source.chain.name
  const balance =
    row.option.balanceRaw === null
      ? undefined
      : decimalBigintToNumber(row.option.balanceRaw, USDC_DECIMALS)
  const quoted =
    row.amountInRaw === undefined
      ? undefined
      : decimalBigintToNumber(row.amountInRaw, USDC_DECIMALS)
  const estimated =
    estimatedAmountInRaw === undefined
      ? undefined
      : decimalBigintToNumber(estimatedAmountInRaw, USDC_DECIMALS)
  const shortfall = getWalletShortfall(quoted ?? estimated ?? required, balance)

  return match({
    status: row.option.status,
    isShort: isL2ShortOfFunds(row),
    hasQuoteFailed: row.hasQuoteFailed,
    isShortOfGas: row.isShortOfGas,
    shortfall,
    isQuoted: quoted !== undefined,
    isEstimated: estimated !== undefined,
  })
    .with({ status: 'unavailable' }, () => (
      <Trans>Couldn't read your balance on {chainName}.</Trans>
    ))
    .with({ isShort: true, shortfall: P.number, isQuoted: true }, (m) => (
      <Trans>
        {formatUsd(m.shortfall)} more needed on {chainName}.
      </Trans>
    ))
    .with({ isShort: true, shortfall: P.number, isEstimated: true }, (m) => (
      <Trans>
        About {formatUsd(m.shortfall)} more needed on {chainName}.
      </Trans>
    ))
    .with({ isShort: true, shortfall: P.number }, (m) => (
      <Trans>
        At least {formatUsd(m.shortfall)} more needed on {chainName}.
      </Trans>
    ))
    .with({ isShort: true }, () => (
      <Trans>Not enough USDC on {chainName}.</Trans>
    ))
    .with({ isShortOfGas: true }, () => (
      <Trans>
        Paying from {chainName} the first time needs a little ETH there to
        approve USDC.
      </Trans>
    ))
    .with({ hasQuoteFailed: true }, () => (
      <Trans>Paying from {chainName} isn't available right now.</Trans>
    ))
    .otherwise(() => undefined)
}

const getL2FeeExplanation = (row: L2PaymentRow) => {
  const chainName = row.option.source.chain.name
  return (
    <Trans>
      An estimate of what the on-chain transactions that register your name
      cost, including moving the USDC from {chainName}. It is paid there with
      the name price, in one signature. The first time, you also approve USDC on{' '}
      {chainName}.
    </Trans>
  )
}

/** A payment row that pays the registration with the wallet's USDC on an L2. */
export const L2SourceListItem = ({
  row,
  networkFee,
  isFeeEstimated,
  isSelected,
  onSelect,
}: {
  readonly row: L2PaymentRow
  /** What the registration costs on top of the name, paid from here, once quoted. */
  readonly networkFee: number | undefined
  /** Borrowed from another chain's quote, as this one could not be quoted. */
  readonly isFeeEstimated: boolean
  readonly isSelected: boolean
  readonly onSelect: () => void
}) => {
  const { t } = useLingui()
  const { option } = row
  const chainName = option.source.chain.name
  const badge = NETWORK_BADGES[option.source.chain.id]

  return (
    <PaymentMethodRow
      amount={
        option.balanceRaw === null
          ? '—'
          : formatUsd(decimalBigintToNumber(option.balanceRaw, USDC_DECIMALS))
      }
      amountLabel={<Trans>balance</Trans>}
      fee={
        isFeeEstimated ? (
          <Trans>
            {chainName} est. fee: ~{formatUsd(networkFee ?? Number.NaN)}
          </Trans>
        ) : (
          <Trans>
            {chainName} est. fee: {formatUsd(networkFee ?? Number.NaN)}
          </Trans>
        )
      }
      feeTooltip={getL2FeeExplanation(row)}
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
      isInsufficient={isL2ShortOfFunds(row)}
      isSelected={isSelected}
      name="USDC"
      onSelect={onSelect}
      selectLabel={t`Select USDC on ${chainName}`}
      warning={
        row.isShortOfGas ? (
          <Trans>Not enough ETH for approval</Trans>
        ) : undefined
      }
    />
  )
}
