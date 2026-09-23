import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans, useLingui } from '@lingui/react/macro'
import { MSymbol } from '@/components/ui/material-symbol'
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
  showInsufficientBalanceErrorInDetails = false,
}: {
  readonly stablecoin: StablecoinBalance
  readonly selectedCoin: SUPPORTED_TOKEN | undefined
  readonly priceUSD: number
  readonly onSelectCoin: (coin: SUPPORTED_TOKEN) => void
  readonly showInsufficientBalanceErrorInDetails?: boolean
}) => {
  const { t } = useLingui()
  const isSelected = selectedCoin === stablecoin.symbol
  const coinBalanceUSD = decimalBigintToNumber(
    BigInt(stablecoin.balance),
    stablecoin.decimals,
  )
  const hasInsufficientBalanceForCoin =
    priceUSD > 0 && hasInsufficientBalance(coinBalanceUSD, priceUSD)
  const showsDetailsError =
    hasInsufficientBalanceForCoin && showInsufficientBalanceErrorInDetails
  const errorId = `payment-method-${stablecoin.address}-error`

  return (
    <button
      aria-describedby={showsDetailsError ? errorId : undefined}
      aria-label={t`Select ${stablecoin.symbol}`}
      className={cn(
        'min-h-17 w-full rounded px-3 py-2 text-left transition-colors',
        showsDetailsError
          ? 'grid grid-cols-[minmax(0,1fr)_auto] content-center items-center gap-x-3'
          : 'flex items-center justify-between gap-3',
        hasInsufficientBalanceForCoin
          ? 'cursor-not-allowed sm:min-h-[77px]'
          : 'sm:min-h-[63px]',
        isSelected
          ? 'bg-ens-quartz-75 sm:items-start sm:bg-ens-quartz-70 sm:p-3'
          : 'hover:bg-ens-quartz-50 sm:items-center sm:px-4 sm:py-3',
        showsDetailsError && isSelected && 'sm:content-start',
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
        {hasInsufficientBalanceForCoin &&
          priceUSD > 0 &&
          !showsDetailsError && (
            <span className="text-[10px] text-ens-signal-danger-500 sm:text-xs sm:leading-[normal]">
              <Trans>Need {formatUsd(priceUSD)}</Trans>
            </span>
          )}
      </span>

      {showsDetailsError && (
        <span
          className="col-span-1 col-start-1 flex h-[15px] items-center gap-0.5 justify-self-start pl-9 text-left text-[10px] text-ens-signal-danger-500 leading-[normal] sm:h-[17px] sm:pl-[46px] sm:text-xs"
          id={errorId}
        >
          <MSymbol
            aria-hidden="true"
            className="ms-opsz-12 ms-wght-400 inline-block"
            symbol="flash_off"
          />
          <Trans>Need {formatUsd(priceUSD)}</Trans>
        </span>
      )}
    </button>
  )
}
