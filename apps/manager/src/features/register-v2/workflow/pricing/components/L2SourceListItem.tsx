import { Trans, useLingui } from '@lingui/react/macro'
import { match, P } from 'ts-pattern'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import type { L2PaymentRow } from '../hooks/useL2Payment'
import { getWalletShortfall } from '../lib/paymentReceiptFigures'
import { PaymentMethodRow } from './PaymentMethodRow'

const USDC_DECIMALS = 6

// A balance just over what the HCA is sent can still fall short of the fee.
const isShortOfQuote = ({ option, amountInRaw }: L2PaymentRow) =>
  amountInRaw !== undefined &&
  option.balanceRaw !== null &&
  option.balanceRaw < amountInRaw

const isL2ShortOfFunds = (row: L2PaymentRow) =>
  row.option.status === 'insufficient' || isShortOfQuote(row)

/** Why the selected L2 cannot pay, shown under the receipt; `required` is the wallet debit, in USD. */
export const getL2SelectionMessage = (
  row: L2PaymentRow,
  required: number | undefined,
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
  const shortfall = getWalletShortfall(quoted ?? required, balance)

  return match({
    status: row.option.status,
    isShort: isL2ShortOfFunds(row),
    hasQuoteFailed: row.hasQuoteFailed,
    shortfall,
    isQuoted: quoted !== undefined,
  })
    .with({ status: 'unavailable' }, () => (
      <Trans>Couldn't read your balance on {chainName}.</Trans>
    ))
    .with({ isShort: true, shortfall: P.number, isQuoted: true }, (m) => (
      <Trans>
        {formatUsd(m.shortfall)} more needed on {chainName}.
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
    .with({ hasQuoteFailed: true }, () => (
      <Trans>Paying from {chainName} isn't available right now.</Trans>
    ))
    .otherwise(() => undefined)
}

/** The total's fee explanation when an L2 pays. */
export const getL2FeeExplanation = (row: L2PaymentRow) => {
  const chainName = row.option.source.chain.name
  return (
    <Trans>
      Includes an estimate of the network fees, including moving the USDC from{' '}
      {chainName}. It is paid there with the name price, in one signature. The
      first time, you also approve USDC on {chainName}.
    </Trans>
  )
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

  return (
    <PaymentMethodRow
      amount={
        option.balanceRaw === null
          ? '—'
          : formatUsd(decimalBigintToNumber(option.balanceRaw, USDC_DECIMALS))
      }
      amountLabel={<Trans>balance</Trans>}
      fee={
        <Trans>
          {chainName} · est. fee {formatUsd(networkFee ?? Number.NaN)}
        </Trans>
      }
      isAvailable
      isFeeLoading={row.isQuoteLoading}
      // Selectable while quoting; the action waits for the quote.
      isInsufficient={isL2ShortOfFunds(row)}
      isSelected={isSelected}
      name={t`USDC on ${chainName}`}
      onSelect={onSelect}
      selectLabel={t`Select USDC on ${chainName}`}
    />
  )
}
