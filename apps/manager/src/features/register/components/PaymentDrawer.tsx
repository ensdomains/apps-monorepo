'use client'

import { useWallet } from '@getpara/react-sdk-lite'
import { CreditCardIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { StablecoinItem } from '@/components/molecules/StablecoinList/StablecoinItem'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useRhinestoneAccount } from '@/lib/rhinestone/useRhinestoneAccount'

interface PaymentDrawerProps {
  domainName?: string
  duration?: number
  priceUSD?: number
  isLoading?: boolean
  onPaymentSelect?: (method: 'crypto' | 'credit-card') => void
  onCryptoSelect?: (cryptoId: string) => void
  onConfirmPayment?: (
    tokenPrice: bigint,
    selectedToken: string,
    options?: { fast?: boolean },
  ) => void
  isUsingAA?: boolean
}

// Credit Card Payment Drawer Component
export const CreditCardPaymentDrawer = ({
  domainName = 'example.eth',
  duration = 25,
  priceUSD = 2800,
  onPaymentSelect,
}: PaymentDrawerProps) => {
  const [open, setOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  // Reusable trigger button
  const triggerButton = (
    <Button
      className="h-[70px] w-full rounded-[4px] border-2 border-ens-blue bg-white font-medium font-mono text-[13px] text-ens-blue uppercase tracking-[1.04px] hover:bg-ens-blue-light"
      onClick={() => {
        onPaymentSelect?.('credit-card')
        setOpen(false)
      }}
    >
      Pay with credit card
    </Button>
  )

  // Credit card (MoonPay mock) content
  const creditCardContent = (
    <div className="space-y-6">
      {/* Domain info */}
      <div className="space-y-2 p-4 text-center">
        <div className="inline-flex items-center rounded bg-foreground px-2 py-1 font-bold font-mono text-background text-lg">
          {domainName}
        </div>
        <div className="text-muted-foreground text-sm">
          × {duration} years • ${priceUSD.toLocaleString()} USD
        </div>
      </div>

      {/* Coming Soon Placeholder */}
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
          <CreditCardIcon className="h-8 w-8 text-blue-600" />
        </div>
        <h3 className="mb-2 font-semibold text-gray-900 text-xl">
          Credit Card Payment
        </h3>
        <p className="mb-4 font-medium text-gray-600 text-lg">Coming Soon</p>
        <p className="max-w-sm text-gray-500 text-sm">
          Credit card payments via MoonPay will be available soon. Please use
          crypto payment for now.
        </p>
      </div>
    </div>
  )

  // Desktop Dialog
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{triggerButton}</DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Credit Card Payment</DialogTitle>
          </DialogHeader>
          {creditCardContent}
        </DialogContent>
      </Dialog>
    )
  }

  // Mobile Drawer
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Credit Card Payment</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6">{creditCardContent}</div>
      </DrawerContent>
    </Drawer>
  )
}

// Crypto Payment Drawer Component
export const CryptoPaymentDrawer = ({
  domainName = 'example.eth',
  duration = 25,
  priceUSD = 2800,
  isLoading = false,
  onPaymentSelect,
  onCryptoSelect,
  onConfirmPayment,
  isUsingAA = false,
}: PaymentDrawerProps) => {
  const [open, setOpen] = useState(false)
  const [selectedCoin, setSelectedCoin] = useState<string>('')

  const isDesktop = useMediaQuery('(min-width: 768px)')
  const { data: wallet } = useWallet()
  const isConnected = !!wallet?.address
  const { stablecoinBalances, isLoadingBalances } = useRhinestoneAccount()

  const hasBalances = (stablecoinBalances?.length || 0) > 0
  const stablecoinLoading = isLoadingBalances
  const selectedCoinBalance = stablecoinBalances?.find(
    (c) => c.address === selectedCoin,
  )
  const actionDisabled =
    isLoading || stablecoinLoading || !selectedCoinBalance || !hasBalances

  const handleCryptoContinue = (options?: { fast?: boolean }) => {
    if (actionDisabled || !selectedCoinBalance) return
    onPaymentSelect?.('crypto')
    onCryptoSelect?.(selectedCoinBalance.address)
    if (onConfirmPayment) {
      const tokenPrice = BigInt(selectedCoinBalance.balance)
      onConfirmPayment(tokenPrice, selectedCoinBalance.address, options)
    }
    setOpen(false)
  }

  useEffect(() => {
    if (
      hasBalances &&
      stablecoinBalances?.length &&
      stablecoinBalances.length > 0 &&
      !selectedCoin
    ) {
      const firstBalance = stablecoinBalances[0]
      if (firstBalance) {
        console.log(
          '🔧 Auto-selecting token:',
          firstBalance.symbol,
          firstBalance.address,
        )
        setSelectedCoin(firstBalance.address)
      }
    }
  }, [hasBalances, stablecoinBalances, selectedCoin])

  const triggerButton = (
    <Button className="h-[70px] w-full rounded-[4px] bg-ens-blue font-medium font-mono text-[13px] text-white uppercase tracking-[1.04px] hover:bg-ens-blue-hover">
      Pay with stablecoins
    </Button>
  )

  const cryptoContent = (
    <div className="space-y-6">
      {/* Domain info */}
      <div className="space-y-2 p-4 text-center">
        <div className="inline-flex items-center rounded bg-foreground px-2 py-1 font-bold font-mono text-background text-lg">
          {domainName}
        </div>
        <div className="text-muted-foreground text-sm">
          × {duration} years • ${priceUSD.toLocaleString()} USD
        </div>
        {isUsingAA && (
          <div className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-green-700 text-sm">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            Gasless Transaction
          </div>
        )}
      </div>

      <div className="text-center">
        <h3 className="font-semibold text-gray-900 text-lg">
          {isUsingAA
            ? 'Pay with stablecoins from smart account'
            : 'Pay with stablecoins'}
        </h3>
        <p className="text-gray-600 text-sm">
          {isUsingAA
            ? 'Using stablecoins from your smart account for gasless transactions'
            : 'Pay with USDC or DAI on Sepolia'}
        </p>
      </div>

      <div className="space-y-4">
        {(isLoading || stablecoinLoading) && (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500 text-sm">
              Loading your stablecoin balances...
            </div>
          </div>
        )}

        {!isLoading && !stablecoinLoading && !hasBalances && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            {!isConnected ? (
              <>
                <div className="mb-2 text-gray-500 text-sm">
                  Please connect your wallet first
                </div>
                <div className="text-gray-400 text-xs">
                  You need to connect a wallet to see your stablecoin balances
                </div>
              </>
            ) : !wallet?.address ? (
              <>
                <div className="mb-2 text-gray-500 text-sm">
                  Network not detected
                </div>
                <div className="text-gray-400 text-xs">
                  Please check your wallet connection
                </div>
              </>
            ) : (
              <>
                <div className="mb-2 text-gray-500 text-sm">
                  No stablecoin balances found
                </div>
                <div className="text-gray-400 text-xs">
                  Make sure you have USDC or DAI on Sepolia
                </div>
              </>
            )}
          </div>
        )}

        {!isLoading && !stablecoinLoading && hasBalances && (
          <div className="space-y-2">
            {stablecoinBalances?.map((stablecoin) => (
              <StablecoinItem
                key={stablecoin.address}
                stablecoin={{
                  address: stablecoin.address,
                  symbol: stablecoin.symbol,
                  formattedBalance: stablecoin.formattedBalance,
                }}
                selectable={true} // Re-enabled: selectable
                isSelected={selectedCoin === stablecoin.address}
                onClick={() => setSelectedCoin(stablecoin.address)}
              />
            ))}
          </div>
        )}

        <Button
          className="w-full"
          disabled={actionDisabled}
          onClick={() => handleCryptoContinue()}
        >
          {isLoading || stablecoinLoading
            ? 'Processing...'
            : !selectedCoinBalance
              ? 'Select a token'
              : `Continue with ${selectedCoinBalance.symbol}`}
        </Button>

        {selectedCoinBalance && (
          <Button
            className="w-full"
            variant="outline"
            disabled={actionDisabled}
            onClick={() => handleCryptoContinue({ fast: true })}
          >
            Continue with {selectedCoinBalance.symbol} (Fast)
          </Button>
        )}
      </div>
    </div>
  )

  // Desktop Dialog
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{triggerButton}</DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Crypto Payment</DialogTitle>
          </DialogHeader>
          {cryptoContent}
        </DialogContent>
      </Dialog>
    )
  }

  // Mobile Drawer
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Crypto Payment</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6">{cryptoContent}</div>
      </DrawerContent>
    </Drawer>
  )
}

// Main Payment Drawer Component (for backward compatibility)
export const PaymentDrawer = ({
  domainName = 'example.eth',
  duration = 25,
  priceUSD = 2800,
  isUsingAA = false,
  onPaymentSelect,
  onCryptoSelect,
  onConfirmPayment,
}: PaymentDrawerProps) => {
  return (
    <div className="space-y-3">
      <h3 className="font-medium text-lg">Select payment method</h3>
      <div className="flex flex-col gap-3">
        <CreditCardPaymentDrawer
          domainName={domainName}
          duration={duration}
          priceUSD={priceUSD}
          onPaymentSelect={onPaymentSelect}
        />
        <CryptoPaymentDrawer
          domainName={domainName}
          duration={duration}
          priceUSD={priceUSD}
          isUsingAA={isUsingAA}
          onPaymentSelect={onPaymentSelect}
          onCryptoSelect={onCryptoSelect}
          onConfirmPayment={onConfirmPayment}
        />
      </div>
    </div>
  )
}
