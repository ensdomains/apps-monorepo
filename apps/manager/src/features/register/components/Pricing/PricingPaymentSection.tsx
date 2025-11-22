import { Button } from '@/components/ui/button'
import type { PricingDuration } from '@/features/register/components/Pricing/types'
import { CreditCardPaymentDrawer, CryptoPaymentDrawer } from '../PaymentDrawer'

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
  if (!isConnected) {
    return (
      <div className="px-5 md:px-0">
        <Button
          variant="default"
          className="h-[70px] w-full rounded-[4px] bg-ens-blue hover:bg-ens-blue-hover md:h-[74px]"
          onClick={onConnect}
        >
          <span className="font-medium font-mono text-[13px] text-white uppercase tracking-[1.04px]">
            Connect or sign in to register
          </span>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <CryptoPaymentDrawer
        domainName={domainName}
        duration={selectedDuration}
        priceUSD={isPriceLoading ? 0 : priceUSD}
        isLoading={isLoading}
        onPaymentSelect={onPaymentSelect}
        onCryptoSelect={onCryptoSelect}
        onConfirmPayment={onConfirmPayment}
        isUsingAA={isUsingAA}
      />
      <CreditCardPaymentDrawer
        domainName={domainName}
        duration={selectedDuration}
        priceUSD={isPriceLoading ? 0 : priceUSD}
        onPaymentSelect={onPaymentSelect}
      />
    </div>
  )
}
