'use client'

import { Copy, Unlink, User } from 'lucide-react'
import { useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AuthModal, useAuthModal } from '../index'

export function ConnectWalletButton() {
  const { isConnected, address } = useAccount()
  const { disconnect } = useDisconnect()
  const { isOpen, openModal, closeModal } = useAuthModal()
  const [copied, setCopied] = useState(false)

  const handleCopyAddress = async (addressToCopy: string) => {
    try {
      await navigator.clipboard.writeText(addressToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy address:', error)
    }
  }

  const getDisplayName = () => {
    if (address) {
      return `${address.slice(0, 6)}...${address.slice(-4)}`
    }
    return 'Connected'
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md p-2 hover:bg-accent hover:text-accent-foreground"
            >
              <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                <User className="size-4 text-muted-foreground" />
              </div>
              <span className="font-medium text-sm">{getDisplayName()}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="p-3">
              <div className="mb-3">
                <div className="font-medium text-sm">
                  {address
                    ? `${address.slice(0, 6)}...${address.slice(-4)}`
                    : 'User'}
                </div>

                <div className="text-muted-foreground text-xs">
                  Connected via Wallet
                </div>
              </div>

              {address && (
                <div className="mb-3">
                  <div className="mb-1 font-medium text-muted-foreground text-xs">
                    Wallet Address
                  </div>
                  <div className="flex items-center gap-2 rounded bg-muted p-2 text-xs">
                    <span className="font-mono text-muted-foreground">
                      {`${address.slice(0, 6)}...${address.slice(-4)}`}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-background"
                      onClick={() => handleCopyAddress(address)}
                    >
                      <Copy className="size-3" />
                    </Button>
                  </div>
                  {copied && (
                    <div className="mt-1 text-green-600 text-xs dark:text-green-400">
                      Copied!
                    </div>
                  )}
                </div>
              )}

              {/* Balance section - you can add balance component here later */}
              <div className="mb-3">
                <div className="mb-1 font-medium text-muted-foreground text-xs">
                  Balance
                </div>
                <div className="text-sm">
                  {/* Add balance component here */}
                  <span className="text-muted-foreground">Loading...</span>
                </div>
              </div>
            </div>

            <DropdownMenuSeparator />

            {/* Disconnect */}
            <DropdownMenuItem onClick={() => disconnect()}>
              <Unlink className="mr-2 size-4" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <>
      <Button onClick={openModal}>Connect Wallet</Button>
      <AuthModal isOpen={isOpen} onClose={closeModal} />
    </>
  )
}
