'use client'

import { useWallet } from '@getpara/react-sdk-lite'
import { CreditCardIcon, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DAI, USDCIcon, USDTIcon } from '@/components/atoms/StableCoinsIcons'
import { DomainAttributePill } from '@/components/molecules/DomainResultCard/DomainAttributePill'
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
import { Input } from '@/components/ui/input'
import { formatYears } from '@/features/register/components/Pricing/utils'
import { getPremiumLabel, STABLECOINS } from '@/features/register/utils'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useSmartAccountContext } from '@/lib/smart-account'
import { cn } from '@/lib/utils'
import {
  checkSelectedCoinBalance,
  formatAmount,
  hasInsufficientBalance,
  parseBalance,
} from '@/utils/payment'

interface PaymentDrawerProps {
  domainName?: string
  duration?: number
  priceUSD?: number
  isLoading?: boolean
  disabled?: boolean
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
  const formattedDurationYears = formatYears(duration)

  // Reusable trigger button
  const triggerButton = (
    <Button
      className="h-16 w-full rounded border-2 border-ens-blue bg-white font-medium font-mono text-ens-blue text-sm uppercase tracking-wider hover:bg-ens-blue-light disabled:cursor-not-allowed disabled:opacity-50"
      disabled
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
          × {formattedDurationYears} year
          {Number(formattedDurationYears) === 1 ? '' : 's'} • $
          {priceUSD.toLocaleString()} USD
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
      <Dialog onOpenChange={setOpen} open={open}>
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
    <Drawer onOpenChange={setOpen} open={open}>
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
  isLoading = false,
  disabled = false,
  priceUSD = 0,
  onPaymentSelect,
  onCryptoSelect,
  onConfirmPayment,
}: PaymentDrawerProps) => {
  const [open, setOpen] = useState(false)
  const [selectedCoin, setSelectedCoin] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [step, setStep] = useState<1 | 2>(1)

  const isDesktop = useMediaQuery('(min-width: 768px)')
  const { data: wallet } = useWallet()
  const isConnected = !!wallet?.address
  const { stablecoinBalances, isLoadingBalances } = useSmartAccountContext()

  const hasBalances = (stablecoinBalances?.length || 0) > 0
  const stablecoinLoading = isLoadingBalances

  // Filter stablecoins based on search query
  const filteredStablecoins = useMemo(() => {
    if (!stablecoinBalances || stablecoinBalances.length === 0) return []
    if (!searchQuery.trim()) return stablecoinBalances

    const query = searchQuery.toLowerCase().trim()
    return stablecoinBalances.filter(
      (coin) =>
        coin.symbol.toLowerCase().includes(query) ||
        'Sepolia'.toLowerCase().includes(query) ||
        `Sepolia ${coin.symbol}`.toLowerCase().includes(query),
    )
  }, [stablecoinBalances, searchQuery])

  const selectedCoinBalance = stablecoinBalances?.find(
    (c) => c.address === selectedCoin,
  )

  const { isInsufficient: hasInsufficientBalanceCheck } =
    checkSelectedCoinBalance(selectedCoinBalance, priceUSD)

  const actionDisabled =
    isLoading ||
    stablecoinLoading ||
    !selectedCoinBalance ||
    !hasBalances ||
    hasInsufficientBalanceCheck

  const handleCryptoContinue = (options?: { fast?: boolean }) => {
    if (actionDisabled || !selectedCoinBalance) return
    onPaymentSelect?.('crypto')
    onCryptoSelect?.(selectedCoinBalance.address)
    if (onConfirmPayment) {
      const tokenPrice = BigInt(selectedCoinBalance.balance)
      onConfirmPayment(tokenPrice, selectedCoinBalance.address, options)
    }
    setOpen(false)
    // Reset state when closing
    setSelectedCoin('')
    setSearchQuery('')
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      // Reset state when closing
      setSelectedCoin('')
      setSearchQuery('')
      setStep(1)
    }
  }

  const handleCoinConfirm = () => {
    if (actionDisabled) return
    setStep(2)
  }

  const triggerButton = (
    <Button
      className="h-16 w-full rounded bg-ens-blue font-medium font-mono text-sm text-white uppercase tracking-wider hover:bg-ens-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
    >
      Pay with stablecoins
    </Button>
  )

  const cryptoContent = (
    <div className="flex min-h-[500px] flex-col justify-between gap-4 px-4">
      <div className="flex flex-col gap-4">
        {/* Header Section */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-col items-center gap-2">
            <h2 className="text-center font-medium text-2xl text-ens-peridot-dense tracking-wide">
              Select coin
            </h2>
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-center font-normal text-ens-gray text-xs tracking-tight">
                Stables accepted
              </p>
              {/* Stablecoin icons */}
              <div className="flex items-center gap-1">
                <USDTIcon className="h-7 w-7" />
                <USDCIcon className="h-7 w-7" />
                <DAI className="h-7 w-7" />
              </div>
            </div>
          </div>

          {/* Search Input */}
          <div className="w-2/3">
            <Input
              className="h-9 rounded border-ens-gray-two"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search coins"
              startIcon={<Search className="h-4 w-4 text-ens-gray" />}
              type="text"
              value={searchQuery}
            />
          </div>
        </div>

        {/* Coin List */}
        <div className="flex flex-col gap-8">
          {(isLoading || stablecoinLoading) && (
            <div className="flex items-center justify-center py-8">
              <div className="text-ens-gray-two text-sm">
                Loading your stablecoin balances...
              </div>
            </div>
          )}

          {!isLoading && !stablecoinLoading && !hasBalances && !isConnected && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="mb-2 text-ens-gray text-sm">
                Please connect your wallet first
              </div>
              <div className="text-ens-gray-three text-xs">
                You need to connect a wallet to see your stablecoin balances
              </div>
            </div>
          )}

          {!isLoading &&
            !stablecoinLoading &&
            hasBalances &&
            filteredStablecoins.length === 0 && (
              <div className="flex min-h-60 flex-col items-center justify-center rounded-xl bg-neutral-100 py-12">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white">
                  <Search className="h-8 w-8 text-ens-gray" />
                </div>
                <h3 className="mb-2 font-normal text-base text-ens-blue-dark">
                  No coins found
                </h3>
                <p className="max-w-56 text-center text-base text-ens-gray">
                  Try searching for a different coin or chain
                </p>
              </div>
            )}

          {!isLoading &&
            !stablecoinLoading &&
            hasBalances &&
            filteredStablecoins.length > 0 && (
              <div className="flex flex-col gap-6">
                {filteredStablecoins.map((stablecoin) => {
                  const isSelected = selectedCoin === stablecoin.address
                  // Find the matching icon from STABLECOINS
                  const coinConfig = Object.values(STABLECOINS).find(
                    (coin) => coin.symbol === stablecoin.symbol,
                  )
                  const IconComponent = coinConfig?.icon || USDCIcon

                  // Check if this coin has insufficient balance
                  const coinBalanceUSD = parseBalance(
                    stablecoin.formattedBalance,
                  )
                  const hasInsufficientBalanceForCoin =
                    priceUSD > 0 &&
                    hasInsufficientBalance(coinBalanceUSD, priceUSD)

                  return (
                    <button
                      className={cn(
                        'flex h-11 items-center justify-between rounded px-2.5 py-4 transition-colors',
                        isSelected
                          ? 'bg-ens-blue-light'
                          : 'hover:bg-ens-gray-two/50',
                        hasInsufficientBalanceForCoin &&
                          'cursor-not-allowed opacity-50',
                      )}
                      disabled={hasInsufficientBalanceForCoin}
                      key={stablecoin.address}
                      onClick={() => setSelectedCoin(stablecoin.address)}
                      type="button"
                    >
                      <div className="flex items-center gap-2">
                        {/* Coin icon with chain badge */}
                        <div className="relative h-8 w-8">
                          <IconComponent className="h-8 w-8" />
                          {/* Chain badge - Sepolia */}
                          <div className="-bottom-0.5 -right-0.5 absolute flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ens-peridot-core">
                            <span className="text-[0.5rem] text-white leading-none">
                              S
                            </span>
                          </div>
                        </div>
                        <p className="text-ens-gray-dark text-sm tracking-wide">
                          {stablecoin.symbol}
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
                            ${formatAmount(coinBalanceUSD, 2)}
                          </p>
                          <span className="text-[#A0A4A6] text-sm">
                            available
                          </span>
                        </div>
                        {hasInsufficientBalanceForCoin && priceUSD > 0 && (
                          <p className="text-ens-error text-xs">
                            Need ${formatAmount(priceUSD)}
                          </p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
        </div>
      </div>

      {/* Confirm Button */}
      <Button
        className={cn(
          'h-20 w-full rounded bg-ens-gray-two font-medium font-mono text-ens-gray-dark text-sm uppercase tracking-wider',
          'hover:bg-ens-gray-two',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !actionDisabled && 'bg-ens-blue text-white hover:bg-ens-blue-hover',
        )}
        disabled={actionDisabled}
        onClick={handleCoinConfirm}
      >
        Confirm Payment
      </Button>
    </div>
  )

  // Get the selected coin info for step 2
  const selectedCoinConfig = selectedCoinBalance
    ? Object.values(STABLECOINS).find(
        (coin) => coin.symbol === selectedCoinBalance.symbol,
      )
    : null
  const SelectedCoinIcon = selectedCoinConfig?.icon || USDCIcon
  const premiumLabel = getPremiumLabel(domainName)

  // Step 2: Confirmation content
  const confirmationContent = (
    <div className="flex min-h-[500px] flex-col justify-between gap-4 px-4">
      <div className="flex flex-col items-center gap-6">
        {/* Header */}
        <h2 className="text-center font-medium text-2xl text-ens-blue tracking-wide">
          Registering
        </h2>

        <div className="flex w-full min-w-0 flex-col items-center gap-4 rounded-xl bg-[rgb(250,250,250)] px-6 py-8">
          {premiumLabel && (
            <DomainAttributePill
              label={premiumLabel.label}
              variant={premiumLabel.variant}
            />
          )}
          <span
            className={cn(
              'w-full min-w-0 text-center font-medium font-semi-mono',
              'text-[40px] leading-[96%] tracking-[-0.8px]',
              'text-[var(--Primary-Grey,#4A5C63)]',
            )}
            title={domainName}
          >
            {domainName.length > 10
              ? `${domainName.slice(0, 10)}…`
              : domainName}
          </span>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-base text-ens-gray">for</span>
          <div className="flex items-baseline gap-1">
            <SelectedCoinIcon className="h-6 w-6 self-center" />
            <span className="font-medium text-2xl text-ens-gray tracking-tight">
              ${formatAmount(priceUSD, 0)}
            </span>
            <span className="text-ens-gray-three text-lg">
              {selectedCoinBalance?.symbol || 'USDC'}
            </span>
          </div>
        </div>
      </div>

      <Button
        className="h-20 w-full rounded bg-ens-blue font-medium font-mono text-sm text-white uppercase tracking-wider hover:bg-ens-blue-hover"
        onClick={() => handleCryptoContinue()}
      >
        Buy Name
      </Button>
    </div>
  )

  const currentContent = step === 1 ? cryptoContent : confirmationContent

  // Desktop Dialog
  if (isDesktop) {
    return (
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogTrigger asChild>{triggerButton}</DialogTrigger>
        <DialogContent className="min-h-[500px]" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle className="sr-only">
              {step === 1 ? 'Select coin' : 'Confirm purchase'}
            </DialogTitle>
          </DialogHeader>
          {currentContent}
        </DialogContent>
      </Dialog>
    )
  }

  // Mobile Drawer
  return (
    <Drawer onOpenChange={handleOpenChange} open={open}>
      <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="px-4 pt-5 pb-5 text-left">
          <DrawerTitle className="sr-only">
            {step === 1 ? 'Select coin' : 'Confirm purchase'}
          </DrawerTitle>
        </DrawerHeader>
        {currentContent}
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
          onPaymentSelect={onPaymentSelect}
          priceUSD={priceUSD}
        />
        <CryptoPaymentDrawer
          domainName={domainName}
          duration={duration}
          isUsingAA={isUsingAA}
          onConfirmPayment={onConfirmPayment}
          onCryptoSelect={onCryptoSelect}
          onPaymentSelect={onPaymentSelect}
          priceUSD={priceUSD}
        />
      </div>
    </div>
  )
}
