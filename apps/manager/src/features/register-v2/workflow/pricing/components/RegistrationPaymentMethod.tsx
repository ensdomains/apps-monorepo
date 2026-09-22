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
        'grid min-h-17 w-full grid-cols-[minmax(0,1fr)_auto] content-center items-center gap-x-3 rounded px-3 py-2 transition-colors sm:content-start sm:pt-3 sm:pb-0',
        hasInsufficientBalance ? 'sm:min-h-[78px]' : 'sm:min-h-[63px]',
        isSelected
          ? 'bg-ens-quartz-75 sm:bg-ens-quartz-70'
          : 'hover:bg-ens-quartz-50',
      )}
      data-slot="payment-method-row"
    >
      <div className="flex min-w-0 flex-1 items-center sm:items-start">
        <button
          aria-describedby={hasInsufficientBalance ? errorId : undefined}
          aria-label={t`Select ${stablecoin.symbol}`}
          className={cn(
            'flex min-w-0 items-center gap-2 text-left sm:items-start sm:gap-3',
            hasInsufficientBalance && 'cursor-not-allowed opacity-50',
          )}
          disabled={hasInsufficientBalance}
          onClick={() => onSelectCoin(stablecoin.symbol as SUPPORTED_TOKEN)}
          type="button"
        >
          <PaymentMethodIcon symbol={stablecoin.symbol} />
          <span
            className="flex min-w-0 flex-col items-start gap-0.5 sm:gap-0"
            data-slot="payment-method-details"
          >
            <span className="truncate font-medium text-ens-gray-dark text-sm tracking-wide sm:text-base sm:leading-5 sm:tracking-normal">
              {stablecoin.symbol}
            </span>
            <span
              className={cn(
                'flex items-center gap-1 whitespace-nowrap text-[10px] text-ens-quartz-500 sm:text-xs sm:leading-4',
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
            'font-medium text-sm tracking-wide sm:text-base sm:leading-5 sm:tracking-normal',
            hasInsufficientBalance
              ? 'text-ens-quartz-350'
              : 'text-ens-gray-dark',
          )}
        >
          {formatUsd(coinBalanceUSD)}
        </span>
        <span
          className={cn(
            'text-[10px] text-ens-quartz-350 sm:text-xs sm:leading-4',
            !hasInsufficientBalance && 'sm:text-ens-quartz-400',
          )}
        >
          <Trans>balance</Trans>
        </span>
      </div>

      {hasInsufficientBalance && (
        <p
          className="col-span-2 flex items-center gap-1 justify-self-end text-right text-[10px] text-ens-error sm:col-span-1 sm:col-start-1 sm:justify-self-start sm:pl-[46px] sm:text-left sm:text-xs sm:leading-4"
          id={errorId}
        >
          <MSymbol
            aria-hidden="true"
            className="ms-opsz-12 ms-wght-400 hidden sm:inline-block"
            symbol="flash_off"
          />
          <Trans>not enough funds to pay network fees</Trans>
        </p>
      )}
    </div>
  )
}
