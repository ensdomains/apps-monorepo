'use client'

import { CreditCardIcon } from 'lucide-react'
import * as React from 'react'
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
import { useMediaQuery } from '@/hooks/use-media-query'

interface PaymentDrawerProps {
  domainName?: string
  duration?: number
  priceUSD?: number
  onPaymentSelect?: (method: 'crypto' | 'credit-card') => void
  onCryptoSelect?: (cryptoId: string) => void
  onConfirmPayment?: () => void
}

// Credit Card Payment Drawer Component
export function CreditCardPaymentDrawer({
  domainName = 'example.eth',
  duration = 25,
  priceUSD = 2800,
  onPaymentSelect,
}: PaymentDrawerProps) {
  const [open, setOpen] = React.useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  // Reusable trigger button
  const triggerButton = (
    <Button
      className="h-12 flex-1 border border-gray-200 bg-white font-semibold text-base dark:border-gray-800 dark:bg-gray-900"
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
export function CryptoPaymentDrawer({
  domainName = 'example.eth',
  duration = 25,
  priceUSD = 2800,
  onPaymentSelect,
  onCryptoSelect,
  onConfirmPayment,
}: PaymentDrawerProps) {
  const [open, setOpen] = React.useState(false)
  const [selectedCoin, setSelectedCoin] = React.useState<string>('')
  const isDesktop = useMediaQuery('(min-width: 768px)')

  // Reusable trigger button
  const triggerButton = (
    <Button className="h-12 flex-1 font-semibold text-base">
      Pay with crypto
    </Button>
  )

  const cryptoOptions = [
    {
      id: 'optimism-usdc',
      name: 'Optimism USDC',
      balance: '$11,987.23',
      icon: 'O',
      color: 'red',
    },
    {
      id: 'base-usdc',
      name: 'Base USDC',
      balance: '$8,987.23',
      icon: 'B',
      color: 'blue',
    },
    {
      id: 'arbitrum-usdt',
      name: 'Arbitrum USDT',
      balance: '$2,987.23',
      icon: 'A',
      color: 'gray',
    },
  ]

  // Crypto payment content
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
      </div>

      {/* Header */}
      <div className="text-center">
        <h3 className="font-semibold text-gray-900 text-lg">Select coin</h3>
        <p className="text-gray-600 text-sm">
          Pay with any stablecoin on any chain
        </p>
      </div>

      {/* Search coins */}
      <div className="space-y-4">
        <Input placeholder="Search coins" className="w-full" />

        {/* Coin options */}
        <div className="space-y-2">
          {cryptoOptions.map((coin) => (
            <button
              key={coin.id}
              onClick={() => setSelectedCoin(coin.id)}
              type="button"
              className="flex w-full cursor-pointer items-center justify-between p-3 text-left hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
                  <span className="font-bold text-gray-700 text-sm">
                    {coin.icon}
                  </span>
                </div>
                <div className="font-medium text-gray-900">{coin.name}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">
                  {coin.balance}
                </span>
                <div
                  className={`h-4 w-4 rounded-full border-2 ${
                    selectedCoin === coin.id
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300'
                  }`}
                >
                  {selectedCoin === coin.id && (
                    <div className="h-full w-full rounded-full bg-blue-500"></div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Continue button */}
        <Button
          className="w-full"
          disabled={!selectedCoin}
          onClick={() => {
            if (selectedCoin) {
              onPaymentSelect?.('crypto')
              onCryptoSelect?.(selectedCoin)
              setOpen(false)
              onConfirmPayment?.()
            }
          }}
        >
          Continue with{' '}
          {selectedCoin
            ? cryptoOptions.find((c) => c.id === selectedCoin)?.name
            : 'Selected Coin'}
        </Button>
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
export function PaymentDrawer({
  domainName = 'example.eth',
  duration = 25,
  priceUSD = 2800,
}: PaymentDrawerProps) {
  return (
    <div className="space-y-3">
      <h3 className="font-medium text-lg">Select payment method</h3>
      <div className="space-y-3">
        <CreditCardPaymentDrawer
          domainName={domainName}
          duration={duration}
          priceUSD={priceUSD}
        />
        <CryptoPaymentDrawer
          domainName={domainName}
          duration={duration}
          priceUSD={priceUSD}
        />
      </div>
    </div>
  )
}
