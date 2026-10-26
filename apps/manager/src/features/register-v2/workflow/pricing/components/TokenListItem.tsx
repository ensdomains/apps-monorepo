import { Trans, useLingui } from '@lingui/react/macro'
import { USDCIcon } from '@/components/atoms/StableCoinsIcons'
import { chain } from '@/config'
import { STABLECOINS } from '@/features/shared/registration/nameUtils'
import type { StablecoinBalance } from '@/lib/smart-account'
import type { TOKEN_SYMBOL } from '@/lib/tokens'
import { cn } from '@/lib/utils'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { hasInsufficientBalance } from '@/utils/payment'
import { PaymentMethodIcon } from './PaymentMethodIcon'
import { PaymentMethodRow } from './PaymentMethodRow'

// The wallet pays on the app's own chain, which isn't always mainnet.
const chainName = chain.name

const MainnetBadge = () => (
  <span
    aria-hidden="true"
    className="flex size-full items-center justify-center bg-[#6c5ce7]"
  >
    <svg className="size-[70%]" viewBox="0 0 12 12">
      <title>Mainnet</title>
      <path d="M6 1 9.5 6 6 8 2.5 6 6 1Z" fill="white" />
      <path d="m2.5 6 3.5 5 3.5-5L6 8 2.5 6Z" fill="white" opacity=".75" />
    </svg>
  </span>
)

export const TokenListItem = <T extends TOKEN_SYMBOL>({
  stablecoin,
  selectedCoin,
  priceUSD,
  onSelectCoin,
  networkFee,
  isNetworkFeeLoading = false,
  showNetworkFeeDetails = false,
}: {
  readonly stablecoin: StablecoinBalance
  readonly selectedCoin: T | undefined
  readonly priceUSD: number
  readonly onSelectCoin: (coin: T) => void
  readonly networkFee?: number
  readonly isNetworkFeeLoading?: boolean
  readonly showNetworkFeeDetails?: boolean
}) => {
  const { t } = useLingui()
  const isSelected = selectedCoin === stablecoin.symbol
  const coinConfig = STABLECOINS[stablecoin.symbol as keyof typeof STABLECOINS]
  const IconComponent = coinConfig?.icon || USDCIcon

  const coinBalanceUSD = decimalBigintToNumber(
    BigInt(stablecoin.balance),
    stablecoin.decimals,
  )
  const isFunded =
    priceUSD <= 0 || !hasInsufficientBalance(coinBalanceUSD, priceUSD)

  if (!showNetworkFeeDetails) {
    return (
      <button
        aria-label={t`Select ${stablecoin.symbol}`}
        className={cn(
          'flex h-11 items-center justify-between rounded px-3 py-4 transition-colors',
          isSelected ? 'bg-ens-quartz-75' : 'hover:bg-ens-quartz-50',
          !isFunded && 'cursor-not-allowed opacity-50',
        )}
        disabled={!isFunded}
        onClick={() => onSelectCoin(stablecoin.symbol as T)}
        type="button"
      >
        <div className="flex items-center gap-2">
          <div className="relative h-8 w-8">
            <IconComponent className="h-8 w-8" />
            <div className="absolute -right-0.5 -bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ens-peridot-core">
              <span className="text-[0.5rem] text-white leading-none">S</span>
            </div>
          </div>
          <p className="text-ens-gray-dark text-sm tracking-wide">
            {stablecoin.symbol}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <div className="flex items-baseline gap-1.5">
            <p
              className={cn(
                'text-right text-base tracking-wide',
                isFunded ? 'text-ens-gray-dark' : 'text-ens-error',
              )}
            >
              {formatUsd(coinBalanceUSD)}
            </p>
            <span className="text-[#A0A4A6] text-sm">
              <Trans>in your wallet</Trans>
            </span>
          </div>
          {!isFunded && priceUSD > 0 && (
            <p className="text-ens-error text-xs">
              <Trans>Need {formatUsd(priceUSD)}</Trans>
            </p>
          )}
        </div>
      </button>
    )
  }

  return (
    <PaymentMethodRow
      amount={formatUsd(coinBalanceUSD)}
      amountLabel={<Trans>balance</Trans>}
      fee={
        <Trans>
          {chainName} · est. fee {formatUsd(networkFee ?? Number.NaN)}
        </Trans>
      }
      icon={
        <PaymentMethodIcon
          icon={<IconComponent className="size-full" />}
          networkBadge={<MainnetBadge />}
        />
      }
      isAvailable
      isFeeLoading={isNetworkFeeLoading}
      isInsufficient={!isFunded}
      isSelected={isSelected}
      name={stablecoin.symbol}
      onSelect={() => onSelectCoin(stablecoin.symbol as T)}
      selectLabel={t`Select ${stablecoin.symbol}`}
    />
  )
}
