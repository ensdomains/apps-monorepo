'use client'

import {
  CheckIcon,
  ChevronRightIcon,
  MailIcon,
  SmartphoneIcon,
  WalletIcon,
} from 'lucide-react'
import * as React from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
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
import { Label } from '@/components/ui/label'
import { useMediaQuery } from '@/hooks/use-media-query'

interface RegisterDrawerProps {
  children: React.ReactNode
  domainName?: string
  duration?: number
  priceUSD?: number
}

export function RegisterDrawer({
  children,
  domainName = 'example.eth',
  duration = 25,
  priceUSD = 2800,
}: RegisterDrawerProps) {
  const [open, setOpen] = React.useState(false)
  const [selectedWallet, setSelectedWallet] = React.useState<string>('coinbase')
  const [_emailPhone, setEmailPhone] = React.useState('')
  const isDesktop = useMediaQuery('(min-width: 768px)')

  // Wagmi hooks for wallet connection
  const { address, isConnected, connector } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  const walletOptions = [
    {
      id: 'metamask',
      name: 'Metamask',
      icon: '🦊',
      installed: true,
    },
    {
      id: 'coinbase',
      name: 'Coinbase',
      icon: '🔵',
      installed: true,
    },
    {
      id: 'rainbow',
      name: 'Rainbow',
      icon: '🌈',
      installed: true,
    },
  ]

  const handleWalletSelect = (walletId: string) => {
    setSelectedWallet(walletId)
  }

  const handleConnect = () => {
    if (isConnected) {
      console.log('Proceeding with registration for address:', address)
      // TODO: Implement registration logic
    } else {
      // Find and connect to the selected wallet
      const selectedConnector = connectors.find((c) =>
        c.name.toLowerCase().includes(selectedWallet.toLowerCase()),
      )

      if (selectedConnector) {
        connect({ connector: selectedConnector })
      } else {
        console.log('Connector not found for:', selectedWallet)
      }
    }
  }

  const handleDisconnect = () => {
    disconnect()
  }

  const handleSocialSignIn = (provider: string) => {
    // TODO: Implement social sign-in logic
    console.log('Signing in with:', provider)
  }

  const emailPhone = React.useId()

  const content = (
    <div className="space-y-6">
      {/* Domain Name Header */}
      <div className="text-center">
        <div className="inline-block break-all rounded-lg bg-foreground px-4 py-2 font-mono text-background text-sm">
          {domainName}
        </div>
        <div className="mt-2 text-muted-foreground text-sm">
          <span className="font-medium">{duration} years</span> •{' '}
          <span className="font-medium">{priceUSD.toLocaleString()} USD</span>
        </div>
      </div>

      {/* Connection Instructions */}
      {isConnected ? (
        <div className="space-y-2 text-center">
          <div className="flex items-center justify-center gap-2">
            <CheckIcon className="h-5 w-5 text-green-500" />
            <span className="font-medium text-sm">Wallet Connected</span>
          </div>
          <div className="text-muted-foreground text-xs">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </div>
          <div className="text-muted-foreground text-xs">
            Connected via {connector?.name}
          </div>
        </div>
      ) : (
        <div className="text-center text-muted-foreground text-sm">
          Connect your wallet or create a new one to complete the registration
        </div>
      )}

      {/* Wallet Connection Section */}
      {isConnected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <WalletIcon className="h-4 w-4 text-green-500" />
              <span className="font-medium text-sm">Connected Wallet</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              className="text-xs"
            >
              Disconnect
            </Button>
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500">
                <CheckIcon className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="font-medium text-white">{connector?.name}</div>
                <div className="text-white text-xs">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span className="font-medium text-sm">Installed</span>
          </div>

          <div className="space-y-2">
            {walletOptions.map((wallet) => (
              <button
                key={wallet.id}
                type="button"
                onClick={() => handleWalletSelect(wallet.id)}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                  selectedWallet === wallet.id
                    ? 'border-blue-500'
                    : 'border-border hover:border-blue-300'
                }`}
              >
                <span className="text-lg">{wallet.icon}</span>
                <span className="font-medium">{wallet.name}</span>
                {selectedWallet === wallet.id && (
                  <div className="ml-auto">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500">
                      <div className="h-2 w-2 rounded-full bg-white"></div>
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Other Options - Only show when not connected */}
      {!isConnected && (
        <>
          <div className="space-y-3">
            <span className="font-medium text-sm">Other Options</span>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1">
                🔗 WalletConnect
              </Button>
              <Button variant="outline" className="flex items-center gap-2">
                Other wallets
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Divider */}
          <div className="text-center text-muted-foreground text-sm">or</div>

          {/* No Wallet Section */}
          <div className="space-y-3 text-center">
            <div className="font-medium">Don't have a wallet? No problem.</div>
            <div className="text-muted-foreground text-sm">
              We'll help you set up a new wallet and complete your purchase with
              a credit card
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex flex-1 items-center gap-2"
                onClick={() => handleSocialSignIn('google')}
              >
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-white">
                  <span className="text-xs">G</span>
                </div>
                Sign in with Google
              </Button>
              <Button
                variant="outline"
                className="flex flex-1 items-center gap-2"
                onClick={() => handleSocialSignIn('apple')}
              >
                <div className="flex h-4 w-4 items-center justify-center rounded-sm bg-black">
                  <span className="text-white text-xs">🍎</span>
                </div>
                Sign in with Apple
              </Button>
            </div>
          </div>

          {/* Email/Phone Input */}
          <div className="space-y-2">
            <Label htmlFor={emailPhone} className="sr-only">
              Email or phone number
            </Label>
            <div className="relative">
              <div className="-translate-y-1/2 absolute top-1/2 left-3 flex transform items-center gap-2">
                <SmartphoneIcon className="h-4 w-4 text-muted-foreground" />
                <MailIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              <Input
                id={emailPhone}
                type="text"
                placeholder="Enter your email or phone number"
                value={emailPhone}
                onChange={(e) => setEmailPhone(e.target.value)}
                className="pl-16"
              />
            </div>
          </div>
        </>
      )}

      {/* Connect Button */}
      <Button
        onClick={handleConnect}
        className="w-full"
        disabled={!isConnected && !selectedWallet && !emailPhone}
      >
        {isPending
          ? 'Connecting...'
          : isConnected
            ? 'Register Domain'
            : 'Connect & Register'}
      </Button>
    </div>
  )

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Register Domain</DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{children}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Register Domain</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6">{content}</div>
      </DrawerContent>
    </Drawer>
  )
}
