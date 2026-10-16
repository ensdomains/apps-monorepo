import { Trans, useLingui } from '@lingui/react/macro'
import { arbitrumSepolia, baseSepolia, optimismSepolia } from 'viem/chains'
import { coinIcons } from '@/assets/coins'
import { USDCIcon } from '@/components/atoms/StableCoinsIcons'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import type { L2PaymentOption } from '../lib/paymentOptions'
import { PaymentMethodIcon } from './PaymentMethodIcon'
import { PaymentMethodRow } from './PaymentMethodRow'

const USDC_DECIMALS = 6

const NETWORK_BADGES: Readonly<Record<number, string | undefined>> = {
  [baseSepolia.id]: coinIcons.base,
  [arbitrumSepolia.id]: coinIcons.arb1,
  [optimismSepolia.id]: coinIcons.op,
}

/** A payment row that pays the registration from an L2, bridging it in first. */
export const L2SourceListItem = ({
  option,
  bridgeAmountRaw,
  feeRaw,
  isSelected,
  isQuoteLoading,
  hasQuoteFailed,
  onSelect,
}: {
  readonly option: L2PaymentOption
  readonly bridgeAmountRaw: bigint | null
  /** The selected row's quoted bridge fee, once quoted. */
  readonly feeRaw?: bigint
  readonly isSelected: boolean
  readonly isQuoteLoading: boolean
  readonly hasQuoteFailed: boolean
  readonly onSelect: () => void
}) => {
  const { t } = useLingui()
  const chainName = option.source.chain.name
  const badge = NETWORK_BADGES[option.source.chain.id]
  const toUsd = (raw: bigint) =>
    formatUsd(decimalBigintToNumber(raw, USDC_DECIMALS))
  const bridgeAmount = bridgeAmountRaw === null ? '—' : toUsd(bridgeAmountRaw)

  const fee =
    isSelected && feeRaw !== undefined ? (
      <Trans>
        Bridge {bridgeAmount} to your wallet, fee {toUsd(feeRaw)}
      </Trans>
    ) : (
      <Trans>Bridge {bridgeAmount} to your wallet</Trans>
    )

  const error =
    option.status === 'insufficient' ? (
      <Trans>Not enough USDC on {chainName}</Trans>
    ) : option.status === 'unavailable' ? (
      <Trans>Couldn't read your balance on {chainName}</Trans>
    ) : isSelected && hasQuoteFailed ? (
      <Trans>Bridging from {chainName} isn't available right now</Trans>
    ) : undefined

  return (
    <PaymentMethodRow
      amount={option.balanceRaw === null ? '—' : toUsd(option.balanceRaw)}
      amountLabel={<Trans>balance</Trans>}
      error={error}
      fee={fee}
      feeTooltip={
        <Trans>
          The USDC is bridged to your wallet first, then the registration is
          paid from there. You approve USDC once per network and sign the
          transfer.
        </Trans>
      }
      feeTooltipLabel={t`How does bridging work?`}
      icon={
        <PaymentMethodIcon
          icon={<USDCIcon className="size-full" />}
          networkBadge={
            badge ? <img alt="" className="size-full" src={badge} /> : undefined
          }
        />
      }
      isAvailable
      isFeeLoading={isSelected && isQuoteLoading}
      isFunded={option.status === 'available'}
      isSelected={isSelected}
      name={t`USDC on ${chainName}`}
      onSelect={onSelect}
      selectLabel={t`Select USDC on ${chainName}`}
    />
  )
}
