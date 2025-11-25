'use client'

import { ArrowLeft, X } from 'lucide-react'
import { useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type VerifyWalletModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVerified?: () => void
}

const VERIFICATION_MESSAGE =
  'ENS would like you to sign this message to verify your wallet ownership. This will not incur any cost.'

export const VerifyWalletModal = ({
  open,
  onOpenChange,
  onVerified,
}: VerifyWalletModalProps) => {
  const { address } = useAccount()
  const [isSigning, setIsSigning] = useState(false)
  const [hasVerified, setHasVerified] = useState(false)

  // Use wagmi's sign message hook for all wallets (Para wallets are also connected through wagmi)
  const { signMessageAsync, isPending: isWagmiSigning } = useSignMessage()

  // Format address for display
  const formattedAddress = address
    ? `${address.slice(0, 5)}...${address.slice(-4)}`
    : ''

  const handleSign = async () => {
    if (!address || isSigning) return

    setIsSigning(true)

    try {
      // Use wagmi's sign message for all wallets
      const signature = await signMessageAsync({
        message: VERIFICATION_MESSAGE,
      })

      // TODO: Revisit this after confirming with team what we want to do with this signature
      // Options: Send to backend API for verification, use for authentication, etc.
      console.log('Wallet verification signature:', {
        address,
        signature,
        message: VERIFICATION_MESSAGE,
      })

      // Store signature in localStorage for now
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          `wallet_signature_${address}`,
          JSON.stringify({
            signature,
            message: VERIFICATION_MESSAGE,
            timestamp: Date.now(),
          }),
        )
      }

      setHasVerified(true)
      onVerified?.()

      // Close modal after a short delay
      setTimeout(() => {
        onOpenChange(false)
        setHasVerified(false)
      }, 1000)
    } catch (error) {
      console.error('Failed to sign message:', error)
    } finally {
      setIsSigning(false)
    }
  }

  const handleClose = () => {
    if (!isSigning) {
      onOpenChange(false)
    }
  }

  const isLoading = isSigning || isWagmiSigning

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-md border-ens-gray-two p-6"
        onInteractOutside={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader className="relative">
          <DialogTitle asChild>
            <h2 className="font-medium text-ens-blue-midnight text-xl tracking-tight">
              Verify Wallet
            </h2>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Please sign a message to verify your wallet ownership. This will not
            incur any cost.
          </DialogDescription>
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 p-0"
              onClick={handleClose}
              disabled={isLoading}
            >
              <ArrowLeft className="h-4 w-4 text-ens-blue" />
            </Button>
            <div />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 p-0"
              onClick={handleClose}
              disabled={isLoading}
            >
              <X className="h-4 w-4 text-ens-blue" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-col items-center gap-2.5 px-9 py-0">
          {/* Connected Wallet Info */}
          <div className="relative h-14 w-full">
            <p className="absolute top-0 left-[68px] font-medium text-ens-gray text-xs tracking-tight">
              Connected wallet
            </p>
            <div className="absolute top-0.5 left-0 flex items-center gap-3 rounded px-2.5 py-1">
              {/* Avatar placeholder */}
              <div className="h-11 w-11 shrink-0 rounded-full bg-ens-gray-two" />
              <div className="flex items-end gap-3">
                <p className="font-bold text-ens-blue-midnight text-lg leading-[0.96] tracking-tight">
                  {formattedAddress}
                </p>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="flex w-full flex-col gap-1">
            <div className="relative min-h-11 w-full">
              <p className="-translate-y-1/2 absolute top-1/2 left-0 font-normal text-base text-ens-blue-midnight leading-none tracking-tight">
                Please sign a message to verify your ownership of the wallet.
                This will not incur any cost.
              </p>
            </div>
            <div className="relative min-h-12 w-full">
              <p className="absolute top-2.5 left-0 font-normal text-base text-ens-gray leading-[0.96] tracking-tight">
                Make sure the message starts with &quot;ENS would like you to
                ...&quot;
              </p>
            </div>
          </div>
        </div>

        {/* Sign Button */}
        <Button
          className={cn(
            'h-11 w-full rounded bg-ens-blue font-medium font-mono text-sm text-white uppercase tracking-wider',
            'hover:bg-ens-blue-hover',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          onClick={handleSign}
          disabled={isLoading || hasVerified}
        >
          {hasVerified
            ? 'Verified!'
            : isLoading
              ? 'Waiting for signature...'
              : 'Sign Message'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
