'use client'

import { BrainCircuit, CheckCircle2, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type EnableSessionModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEnableSession: () => Promise<void>
  walletAddress?: string
  smartAccountAddress?: string
}

export const EnableSessionModal = ({
  open,
  onOpenChange,
  onEnableSession,
  walletAddress: _walletAddress,
  smartAccountAddress,
}: EnableSessionModalProps) => {
  const [status, setStatus] = useState<
    'idle' | 'signing' | 'success' | 'error'
  >('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const formatAddress = (address?: string) => {
    if (!address) return ''
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const handleEnable = async () => {
    if (status === 'signing') return

    setStatus('signing')
    setErrorMessage(null)

    try {
      await onEnableSession()
      setStatus('success')

      // Close modal after a short delay
      setTimeout(() => {
        onOpenChange(false)
        setStatus('idle')
      }, 1500)
    } catch (error) {
      console.error('Failed to enable session:', error)
      setStatus('error')
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to enable session',
      )
    }
  }

  const handleClose = () => {
    if (status !== 'signing') {
      onOpenChange(false)
      setStatus('idle')
      setErrorMessage(null)
    }
  }

  const handleSkip = () => {
    // Allow users to skip - they'll sign each transaction instead
    onOpenChange(false)
    setStatus('idle')
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-md border-ens-gray-two p-6"
        onInteractOutside={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader className="relative">
          <div className="flex items-center justify-between">
            <DialogTitle asChild>
              <h2 className="font-medium text-ens-blue-midnight text-xl tracking-tight">
                Enable Smart Sessions
              </h2>
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 p-0"
              onClick={handleClose}
              disabled={status === 'signing'}
            >
              <X className="h-4 w-4 text-ens-gray" />
            </Button>
          </div>
          <DialogDescription className="sr-only">
            Sign once to enable gasless transactions for your ENS operations.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {/* Icon */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ens-blue/10">
            {status === 'success' ? (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            ) : status === 'signing' ? (
              <Loader2 className="h-8 w-8 animate-spin text-ens-blue" />
            ) : (
              <BrainCircuit className="h-8 w-8 text-ens-blue" />
            )}
          </div>

          {/* Account Info */}
          {smartAccountAddress && (
            <div className="flex flex-col items-center gap-1">
              <p className="text-ens-gray text-xs">Smart Account</p>
              <p className="font-mono text-ens-blue-midnight text-sm">
                {formatAddress(smartAccountAddress)}
              </p>
            </div>
          )}

          {/* Description */}
          <div className="text-center">
            {status === 'success' ? (
              <p className="text-green-600">
                Sessions enabled! You can now transact without signing each
                time.
              </p>
            ) : status === 'error' ? (
              <div className="flex flex-col gap-2">
                <p className="text-red-600">
                  {errorMessage || 'Something went wrong. Please try again.'}
                </p>
              </div>
            ) : (
              <>
                <p className="text-ens-blue-midnight">
                  Sign once to enable seamless transactions.
                </p>
                <p className="mt-2 text-ens-gray text-sm">
                  After signing, your ENS operations (registrations, renewals,
                  etc.) won&apos;t require additional wallet signatures.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {status !== 'success' && (
            <>
              <Button
                className={cn(
                  'h-11 w-full rounded bg-ens-blue font-medium font-mono text-sm text-white uppercase tracking-wider',
                  'hover:bg-ens-blue-hover',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
                onClick={handleEnable}
                disabled={status === 'signing'}
              >
                {status === 'signing'
                  ? 'Waiting for signature...'
                  : status === 'error'
                    ? 'Try Again'
                    : 'Enable Sessions'}
              </Button>

              <Button
                variant="ghost"
                className="h-11 w-full text-ens-gray hover:text-ens-blue-midnight"
                onClick={handleSkip}
                disabled={status === 'signing'}
              >
                Skip for now
              </Button>
            </>
          )}
        </div>

        {/* Footer note */}
        {status === 'idle' && (
          <p className="text-center text-ens-gray text-xs">
            This signature is free and doesn&apos;t cost any gas.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
