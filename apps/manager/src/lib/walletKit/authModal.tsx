'use client'

import { HelpCircle } from 'lucide-react'
import { useState } from 'react'
import { useAccount, useConnect } from 'wagmi'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ParaAuthComponent } from './components/ParaAuthComponent'
import { metaMaskConnector, walletConnectConnector } from './connectors'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
}

interface WalletOption {
  id: string
  name: string
  icon: string
  status?: 'installed' | 'qr-code' | 'available'
  connector: typeof metaMaskConnector | typeof walletConnectConnector
}

const walletOptions: WalletOption[] = [
  {
    id: 'walletconnect',
    name: 'WalletConnect',
    icon: '🔗',
    status: 'qr-code',
    connector: walletConnectConnector,
  },
  {
    id: 'metamask',
    name: 'MetaMask',
    icon: '🦊',
    status: 'installed',
    connector: metaMaskConnector,
  },
]

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const { connect } = useConnect()
  const { isConnected } = useAccount()

  const filteredWallets = walletOptions.filter((wallet) =>
    wallet.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleWalletConnect = async (
    connector: typeof metaMaskConnector | typeof walletConnectConnector,
  ) => {
    try {
      await connect({ connector })
      onClose()
    } catch (error) {
      console.error('Failed to connect wallet:', error)
    }
  }

  const handleParaAuthSuccess = () => {
    // Don't close the modal immediately - let the user see the connect button
    // The modal will close when they successfully connect
  }

  if (isConnected) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <DialogTitle className="font-semibold text-xl">
              Connect Wallet
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Wallet Options Section */}
          <div className="space-y-4">
            {filteredWallets.map((wallet) => (
              <button
                key={wallet.id}
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 transition-colors hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                onClick={() => handleWalletConnect(wallet.connector)}
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{wallet.icon}</div>
                  <span className="font-medium">{wallet.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {wallet.status === 'installed' && (
                    <span className="rounded bg-green-500/20 px-2 py-1 text-green-400 text-xs">
                      INSTALLED
                    </span>
                  )}
                  {wallet.status === 'qr-code' && (
                    <span className="rounded bg-blue-500/20 px-2 py-1 text-blue-400 text-xs">
                      QR CODE
                    </span>
                  )}
                </div>
              </button>
            ))}

            {/* Search Bar */}
            <div className="relative">
              {' '}
              <Input
                placeholder="Search Wallet"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-slate-200 border-t dark:border-slate-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-2 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                or
              </span>
            </div>
          </div>

          {/* Para Auth Section */}
          <ParaAuthComponent onSuccess={handleParaAuthSuccess} />
        </div>

        {/* Footer */}
        <div className="space-y-2 text-center text-slate-500 text-sm dark:text-slate-400">
          <p>
            By connecting your wallet, you agree to our{' '}
            <a
              href="/terms"
              className="text-slate-600 hover:underline dark:text-slate-400"
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="/privacy"
              className="text-slate-600 hover:underline dark:text-slate-400"
            >
              Privacy Policy
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
