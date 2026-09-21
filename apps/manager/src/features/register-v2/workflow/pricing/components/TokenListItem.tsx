import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans, useLingui } from '@lingui/react/macro'
import type { StablecoinBalance } from '@/lib/smart-account'
import { cn } from '@/lib/utils'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { hasInsufficientBalance } from '@/utils/payment'
import { PaymentMethodIcon } from './PaymentMethodIcon'

export const TokenListItem = ({
  stablecoin,
  selectedCoin,
  priceUSD,
  onSelectCoin,
}: {
  stablecoin: StablecoinBalance
  selectedCoin: SUPPORTED_TOKEN | undefined
  priceUSD: number
  onSelectCoin: (coin: SUPPORTED_TOKEN) => void
}) => {
  const { t } = useLingui()
  const isSelected = selectedCoin === stablecoin.symbol
  const coinBalanceUSD = decimalBigintToNumber(
    BigInt(stablecoin.balance),
    stablecoin.decimals,
  )
  const hasInsufficientBalanceForCoin =
    priceUSD > 0 && hasInsufficientBalance(coinBalanceUSD, priceUSD)

  return (
    <button
      aria-label={t`Select ${stablecoin.symbol}`}
      className={cn(
        'flex min-h-17 w-full items-center justify-between gap-3 rounded px-3 py-2 text-left transition-colors',
        isSelected ? 'bg-ens-quartz-75' : 'hover:bg-ens-quartz-50',
        hasInsufficientBalanceForCoin && 'cursor-not-allowed opacity-50',
      )}
      data-slot="payment-method-row"
      disabled={hasInsufficientBalanceForCoin}
      onClick={() => onSelectCoin(stablecoin.symbol as SUPPORTED_TOKEN)}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-2 sm:gap-3">
        <PaymentMethodIcon symbol={stablecoin.symbol} />
        <span
          className="truncate font-medium text-ens-gray-dark text-sm tracking-wide sm:text-base"
          data-slot="payment-method-details"
        >
          {stablecoin.symbol}
        </span>
      </span>
      <span
        className="flex shrink-0 flex-col items-end gap-0.5 text-right"
        data-slot="payment-method-balance"
      >
        <span
          className={cn(
            'font-medium text-sm tracking-wide sm:text-base',
            hasInsufficientBalanceForCoin
              ? 'text-ens-error'
              : 'text-ens-gray-dark',
          )}
        >
          {formatUsd(coinBalanceUSD)}
        </span>
        <span className="text-[10px] text-ens-quartz-350 sm:text-sm">
          <Trans>in your wallet</Trans>
        </span>
        {hasInsufficientBalanceForCoin && priceUSD > 0 && (
          <span className="text-[10px] text-ens-error sm:text-xs">
            <Trans>Need {formatUsd(priceUSD)}</Trans>
          </span>
        )}
      </span>
    </button>
  )
}
