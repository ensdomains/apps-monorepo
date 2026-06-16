import { Trans, useLingui } from '@lingui/react/macro'
import { getChainBadge, getTokenIcon } from '@/lib/payment/paymentSourceIcons'
import type { PaymentSourceBalance } from '@/lib/payment/usePaymentSourceBalances'
import { cn } from '@/lib/utils'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { hasInsufficientBalance } from '@/utils/payment'

export const TokenListItem = ({
  source,
  selectedSourceId,
  priceUSD,
  onSelectSource,
}: {
  source: PaymentSourceBalance
  selectedSourceId: string | undefined
  priceUSD: number
  onSelectSource: (source: PaymentSourceBalance) => void
}) => {
  const { t } = useLingui()
  const isSelected = selectedSourceId === source.id
  const Icon = getTokenIcon(source)
  const ChainBadge = getChainBadge(source)

  const coinBalanceUSD = decimalBigintToNumber(
    BigInt(source.balance),
    source.decimals,
  )
  const hasInsufficientBalanceForCoin =
    priceUSD > 0 && hasInsufficientBalance(coinBalanceUSD, priceUSD)

  return (
    <button
      aria-label={t`Select ${source.label}`}
      className={cn(
        'flex h-11 items-center justify-between rounded px-2.5 py-4 transition-colors',
        isSelected ? 'bg-ens-blue-light' : 'hover:bg-ens-gray-two/50',
        hasInsufficientBalanceForCoin && 'cursor-not-allowed opacity-50',
      )}
      disabled={hasInsufficientBalanceForCoin}
      onClick={() => onSelectSource(source)}
      type="button"
    >
      <div className="flex items-center gap-2">
        <div className="relative h-8 w-8">
          <Icon className="h-8 w-8" />
          <div className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5">
            <ChainBadge className="h-3.5 w-3.5" />
          </div>
        </div>
        <p className="text-ens-gray-dark text-sm tracking-wide">
          {source.label}
        </p>
      </div>
      <div className="flex flex-col items-end">
        <div className="flex items-baseline gap-1.5">
          <p
            className={cn(
              'text-right text-base tracking-wide',
              hasInsufficientBalanceForCoin
                ? 'text-ens-error'
                : 'text-ens-gray-dark',
            )}
          >
            {formatUsd(coinBalanceUSD)}
          </p>
          <span className="text-[#A0A4A6] text-sm">
            <Trans>available</Trans>
          </span>
        </div>
        {hasInsufficientBalanceForCoin && priceUSD > 0 && (
          <p className="text-ens-error text-xs">
            <Trans>Need {formatUsd(priceUSD)}</Trans>
          </p>
        )}
      </div>
    </button>
  )
}
