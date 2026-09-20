import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans, useLingui } from '@lingui/react/macro'
import { USDCIcon } from '@/components/atoms/StableCoinsIcons'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { STABLECOINS } from '@/features/shared/registration/nameUtils'
import type { StablecoinBalance } from '@/lib/smart-account'
import { cn } from '@/lib/utils'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'

export const RegistrationPaymentMethod = ({
  stablecoin,
  selectedCoin,
  networkFee,
  isNetworkFeeLoading,
  hasInsufficientBalance,
  onSelectCoin,
}: {
  stablecoin: StablecoinBalance
  selectedCoin: SUPPORTED_TOKEN | undefined
  networkFee: number | undefined
  isNetworkFeeLoading: boolean
  hasInsufficientBalance: boolean
  onSelectCoin: (coin: SUPPORTED_TOKEN) => void
}) => {
  const { t } = useLingui()
  const isSelected = selectedCoin === stablecoin.symbol
  const coinConfig = STABLECOINS[stablecoin.symbol as keyof typeof STABLECOINS]
  const IconComponent = coinConfig?.icon || USDCIcon
  const errorId = `payment-method-${stablecoin.address}-error`

  const coinBalanceUSD = decimalBigintToNumber(
    BigInt(stablecoin.balance),
    stablecoin.decimals,
  )

  return (
    <div
      className={cn(
        'flex min-h-20 w-full items-center justify-between gap-3 rounded px-3 py-3 transition-colors',
        isSelected ? 'bg-ens-quartz-75' : 'hover:bg-ens-quartz-50',
      )}
    >
      <button
        aria-describedby={hasInsufficientBalance ? errorId : undefined}
        aria-label={t`Select ${stablecoin.symbol}`}
        className={cn(
          'flex min-w-0 items-center gap-2 text-left',
          hasInsufficientBalance && 'cursor-not-allowed opacity-50',
        )}
        disabled={hasInsufficientBalance}
        onClick={() => onSelectCoin(stablecoin.symbol as SUPPORTED_TOKEN)}
        type="button"
      >
        <div className="relative h-8 w-8 shrink-0">
          <IconComponent className="h-8 w-8" />
          <div className="absolute -right-0.5 -bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ens-peridot-core">
            <span className="text-[0.5rem] text-white leading-none">S</span>
          </div>
        </div>
        <span className="truncate text-ens-gray-dark text-sm tracking-wide">
          {stablecoin.symbol}
        </span>
      </button>

      <div className="flex min-w-0 flex-col items-end gap-1 text-right">
        <div className="flex flex-wrap items-baseline justify-end gap-x-1.5">
          <span
            className={cn(
              'text-base tracking-wide',
              hasInsufficientBalance ? 'text-ens-error' : 'text-ens-gray-dark',
            )}
          >
            {formatUsd(coinBalanceUSD)}
          </span>
          <span className="text-[#A0A4A6] text-sm">
            <Trans>in your wallet</Trans>
          </span>
        </div>

        <div
          className={cn(
            'flex flex-wrap items-center justify-end gap-x-1 text-ens-quartz-500 text-xs',
            isNetworkFeeLoading && 'animate-pulse',
          )}
        >
          <span>
            <Trans>Mainnet est. fee:</Trans>
          </span>
          <span className="tabular-nums">
            {networkFee === undefined ? '—' : formatUsd(networkFee)}
          </span>
          <Tooltip>
            <TooltipTrigger
              aria-label={t`What is the network fee?`}
              className="flex items-center"
              type="button"
            >
              <MSymbol className="ms-opsz-20 ms-wght-400" symbol="info" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-center">
              <Trans>
                An estimate of what the two on-chain transactions that register
                your name will cost. It is collected together with the name
                price, in the same approval.
              </Trans>
            </TooltipContent>
          </Tooltip>
        </div>

        {hasInsufficientBalance && (
          <p className="text-ens-error text-xs" id={errorId}>
            <Trans>not enough funds to pay network fees</Trans>
          </p>
        )}
      </div>
    </div>
  )
}
