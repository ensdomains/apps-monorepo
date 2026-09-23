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
        hasInsufficientBalanceForCoin
          ? 'cursor-not-allowed sm:min-h-[77px]'
          : 'sm:min-h-[63px]',
        isSelected
          ? 'bg-ens-quartz-75 sm:items-start sm:bg-ens-quartz-70 sm:p-3'
          : 'hover:bg-ens-quartz-50 sm:items-center sm:px-4 sm:py-3',
      )}
      data-slot="payment-method-row"
      disabled={hasInsufficientBalanceForCoin}
      onClick={() => onSelectCoin(stablecoin.symbol as SUPPORTED_TOKEN)}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-2 sm:gap-3">
        <PaymentMethodIcon
          className={hasInsufficientBalanceForCoin ? 'opacity-30' : undefined}
          symbol={stablecoin.symbol}
        />
        <span
          className="truncate font-medium text-ens-gray-dark text-sm tracking-wide sm:text-black sm:leading-[normal] sm:tracking-normal"
          data-slot="payment-method-details"
        >
          {stablecoin.symbol}
        </span>
      </span>
      <span
        className="flex shrink-0 flex-col items-end gap-0.5 text-right sm:gap-0"
        data-slot="payment-method-balance"
      >
        <span
          className={cn(
            'font-medium text-sm tracking-wide sm:font-[450] sm:text-[15px] sm:leading-[22px] sm:tracking-normal',
            hasInsufficientBalanceForCoin
              ? 'text-ens-quartz-350 sm:text-black/30'
              : 'text-ens-gray-dark sm:text-black',
          )}
        >
          {formatUsd(coinBalanceUSD)}
        </span>
        <span className="text-[10px] text-ens-quartz-350 sm:font-[360] sm:text-ens-quartz-400 sm:text-xs sm:leading-[normal]">
          <Trans>balance</Trans>
        </span>
        {hasInsufficientBalanceForCoin && priceUSD > 0 && (
          <span className="text-[10px] text-ens-signal-danger-500 sm:text-xs sm:leading-[normal]">
            <Trans>Need {formatUsd(priceUSD)}</Trans>
          </span>
        )}
      </span>
    </button>
  )
}
