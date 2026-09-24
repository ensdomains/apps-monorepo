import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans, useLingui } from '@lingui/react/macro'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { StablecoinBalance } from '@/lib/smart-account'
import { cn } from '@/lib/utils'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { PaymentMethodError } from './PaymentMethodError'
import { PaymentMethodIcon } from './PaymentMethodIcon'

export const RegistrationPaymentMethod = ({
  stablecoin,
  selectedCoin,
  networkFee,
  isNetworkFeeLoading,
  hasInsufficientBalance,
  onSelectCoin,
}: {
  readonly stablecoin: StablecoinBalance
  readonly selectedCoin: SUPPORTED_TOKEN | undefined
  readonly networkFee: number | undefined
  readonly isNetworkFeeLoading: boolean
  readonly hasInsufficientBalance: boolean
  readonly onSelectCoin: (coin: SUPPORTED_TOKEN) => void
}) => {
  const { t } = useLingui()
  const isSelected = selectedCoin === stablecoin.symbol
  const errorId = `payment-method-${stablecoin.address}-error`

  const coinBalanceUSD = decimalBigintToNumber(
    BigInt(stablecoin.balance),
    stablecoin.decimals,
  )

  return (
    <div
      className={cn(
        'grid w-full grid-cols-[minmax(0,1fr)_auto] content-start items-start gap-x-3 rounded px-3 py-2 transition-colors',
        isSelected
          ? 'bg-ens-quartz-75 sm:bg-ens-quartz-70 sm:p-3'
          : 'hover:bg-ens-quartz-50 sm:px-4 sm:py-3',
      )}
      data-slot="payment-method-row"
    >
      <div className="flex min-w-0 flex-1 items-start">
        <button
          aria-describedby={hasInsufficientBalance ? errorId : undefined}
          aria-label={t`Select ${stablecoin.symbol}`}
          className={cn(
            'flex min-w-0 items-start gap-2 text-left sm:gap-3',
            hasInsufficientBalance && 'cursor-not-allowed',
          )}
          disabled={hasInsufficientBalance}
          onClick={() => onSelectCoin(stablecoin.symbol as SUPPORTED_TOKEN)}
          type="button"
        >
          <PaymentMethodIcon
            className={hasInsufficientBalance ? 'opacity-30' : undefined}
            symbol={stablecoin.symbol}
          />
          <span
            className="flex min-w-0 flex-col items-start gap-0.5 sm:gap-0"
            data-slot="payment-method-details"
          >
            <span className="truncate font-medium text-ens-gray-dark text-sm tracking-wide sm:text-black sm:leading-[normal] sm:tracking-normal">
              {stablecoin.symbol}
            </span>
            <span
              className={cn(
                'flex items-center gap-1 whitespace-nowrap text-[10px] text-ens-quartz-500 sm:font-[360] sm:text-xs sm:leading-[normal]',
                isNetworkFeeLoading && 'animate-pulse',
              )}
            >
              <span>
                <Trans>Mainnet est. fee:</Trans>
              </span>
              <span className="tabular-nums">
                {networkFee === undefined ? '—' : formatUsd(networkFee)}
              </span>
            </span>
          </span>
        </button>

        <Tooltip>
          <TooltipTrigger
            aria-label={t`What is the network fee?`}
            className="ml-0.5 flex size-4 shrink-0 items-end justify-center self-end text-ens-quartz-350 sm:mb-0.5 sm:ml-1"
            type="button"
          >
            <MSymbol
              className="ms-opsz-14 ms-wght-400 sm:ms-opsz-12"
              symbol="info"
            />
          </TooltipTrigger>
          <TooltipContent className="max-w-64 text-center">
            <Trans>
              An estimate of what the two on-chain transactions that register
              your name will cost. It is collected together with the name price,
              in the same approval.
            </Trans>
          </TooltipContent>
        </Tooltip>
      </div>

      <div
        className="flex shrink-0 flex-col items-end gap-0.5 text-right sm:gap-0"
        data-slot="payment-method-balance"
      >
        <span
          className={cn(
            'font-medium text-sm tracking-wide sm:font-[450] sm:text-[15px] sm:leading-[22px] sm:tracking-normal',
            hasInsufficientBalance
              ? 'text-ens-quartz-350 sm:text-black/30'
              : 'text-ens-gray-dark sm:text-black',
          )}
        >
          {formatUsd(coinBalanceUSD)}
        </span>
        <span className="text-[10px] text-ens-quartz-350 sm:font-[360] sm:text-ens-quartz-400 sm:text-xs sm:leading-[normal]">
          <Trans>balance</Trans>
        </span>
      </div>

      {hasInsufficientBalance && (
        <PaymentMethodError id={errorId}>
          <Trans>not enough funds to pay network fees</Trans>
        </PaymentMethodError>
      )}
    </div>
  )
}
