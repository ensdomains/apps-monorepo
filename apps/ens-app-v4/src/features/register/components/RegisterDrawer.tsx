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
  const [emailPhone, setEmailPhone] = React.useState('')
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

  const content = (
    <div className="space-y-6">
      {/* Domain Name Header */}
      <div className="text-center">
        <div className="bg-foreground text-background px-4 py-2 rounded-lg inline-block text-sm font-mono break-all">
          {domainName}
        </div>
        <div className="text-sm text-muted-foreground mt-2">
          <span className="font-medium">{duration} years</span> •{' '}
          <span className="font-medium">{priceUSD.toLocaleString()} USD</span>
        </div>
      </div>

      {/* Connection Instructions */}
      {isConnected ? (
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <CheckIcon className="w-5 h-5 text-green-500" />
            <span className="text-sm font-medium">Wallet Connected</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </div>
          <div className="text-xs text-muted-foreground">
            Connected via {connector?.name}
          </div>
        </div>
      ) : (
        <div className="text-center text-sm text-muted-foreground">
          Connect your wallet or create a new one to complete the registration
        </div>
      )}

      {/* Wallet Connection Section */}
      {isConnected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <WalletIcon className="w-4 h-4 text-green-500" />
              <span className="text-sm font-medium">Connected Wallet</span>
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

          <div className="p-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                <CheckIcon className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-medium text-white">{connector?.name}</div>
                <div className="text-xs text-white">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm font-medium">Installed</span>
          </div>

          <div className="space-y-2">
            {walletOptions.map((wallet) => (
              <button
                key={wallet.id}
                type="button"
                onClick={() => handleWalletSelect(wallet.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                  selectedWallet === wallet.id
                    ? 'border-blue-500'
                    : 'border-border hover:border-blue-300'
                }`}
              >
                <span className="text-lg">{wallet.icon}</span>
                <span className="font-medium">{wallet.name}</span>
                {selectedWallet === wallet.id && (
                  <div className="ml-auto">
                    <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
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
            <span className="text-sm font-medium">Other Options</span>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1">
                🔗 WalletConnect
              </Button>
              <Button variant="outline" className="flex items-center gap-2">
                Other wallets
                <ChevronRightIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Divider */}
          <div className="text-center text-sm text-muted-foreground">or</div>

          {/* No Wallet Section */}
          <div className="text-center space-y-3">
            <div className="font-medium">Don't have a wallet? No problem.</div>
            <div className="text-sm text-muted-foreground">
              We'll help you set up a new wallet and complete your purchase with
              a credit card
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 flex items-center gap-2"
                onClick={() => handleSocialSignIn('google')}
              >
                <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
                  <span className="text-xs">G</span>
                </div>
                Sign in with Google
              </Button>
              <Button
                variant="outline"
                className="flex-1 flex items-center gap-2"
                onClick={() => handleSocialSignIn('apple')}
              >
                <div className="w-4 h-4 bg-black rounded-sm flex items-center justify-center">
                  <span className="text-xs text-white">🍎</span>
                </div>
                Sign in with Apple
              </Button>
            </div>
          </div>

          {/* Email/Phone Input */}
          <div className="space-y-2">
            <Label htmlFor="email-phone" className="sr-only">
              Email or phone number
            </Label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                <SmartphoneIcon className="w-4 h-4 text-muted-foreground" />
                <MailIcon className="w-4 h-4 text-muted-foreground" />
              </div>
              <Input
                id="email-phone"
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
