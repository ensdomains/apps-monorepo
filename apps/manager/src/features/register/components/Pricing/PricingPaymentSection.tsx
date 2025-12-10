import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PricingDuration } from '@/features/register/components/Pricing/types'
import { useSmartAccount } from '@/lib/smart-account'
import {
  CreditCardPaymentDrawer,
  CryptoPaymentDrawer,
} from '../RegistrationInProgress/PaymentDrawer'

type PricingPaymentSectionProps = {
  isConnected: boolean
  isLoading: boolean
  domainName: string
  selectedDuration: PricingDuration
  priceUSD: number
  isPriceLoading: boolean
  isUsingAA: boolean
  onConnect: () => void
  onPaymentSelect: (method: 'crypto' | 'credit-card') => void
  onCryptoSelect: (cryptoId: string) => void
  onConfirmPayment: (
    tokenPrice: bigint,
    selectedToken: string,
    options?: { fast?: boolean },
  ) => void
}

export const PricingPaymentSection = ({
  isConnected,
  isLoading,
  domainName,
  selectedDuration,
  priceUSD,
  isPriceLoading,
  isUsingAA,
  onConnect,
  onPaymentSelect,
  onCryptoSelect,
  onConfirmPayment,
}: PricingPaymentSectionProps) => {
  const { isLoadingSmartAccountEth, stablecoinBalances, isLoadingBalances } =
    useSmartAccount()

  const hasStablecoins =
    (stablecoinBalances?.length || 0) > 0 &&
    stablecoinBalances?.some((balance) => BigInt(balance.balance) > 0n)
  const isLoadingBalancesCheck = isLoadingSmartAccountEth || isLoadingBalances

  if (!isConnected) {
    return (
      <div className="px-5 md:px-0">
        <Button
          variant="default"
          className="h-16 w-full rounded bg-ens-blue hover:bg-ens-blue-hover md:h-20"
          onClick={onConnect}
        >
          <span className="font-medium font-mono text-sm text-white uppercase tracking-wider">
            Connect or sign in to register
          </span>
        </Button>
      </div>
    )
  }

  const showNoStablecoinError = !isLoadingBalancesCheck && !hasStablecoins

  const disableCryptoButton = showNoStablecoinError

  return (
    <div className="flex flex-col gap-3">
      {showNoStablecoinError && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
          <div className="flex-1">
            <p className="text-red-800 text-sm">
              Insufficient funds. You don't have enough Tether, USDC, or DAI in
              your wallet for this purchase.
            </p>
          </div>
        </div>
      )}

      <CryptoPaymentDrawer
        domainName={domainName}
        duration={selectedDuration}
        priceUSD={isPriceLoading ? 0 : priceUSD}
        isLoading={isLoading}
        disabled={disableCryptoButton}
        onPaymentSelect={onPaymentSelect}
        onCryptoSelect={onCryptoSelect}
        onConfirmPayment={onConfirmPayment}
        isUsingAA={isUsingAA}
      />
      <CreditCardPaymentDrawer
        domainName={domainName}
        duration={selectedDuration}
        priceUSD={isPriceLoading ? 0 : priceUSD}
        disabled={false}
        onPaymentSelect={onPaymentSelect}
      />
    </div>
  )
}
