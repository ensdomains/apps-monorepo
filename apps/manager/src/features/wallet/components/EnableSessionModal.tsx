'use client'

import { Trans, useLingui } from '@lingui/react/macro'
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
  const { t } = useLingui()
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
        error instanceof Error ? error.message : t`Failed to enable session`,
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
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent
        className="max-w-md border-ens-gray-two p-6"
        onInteractOutside={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader className="relative">
          <div className="flex items-center justify-between">
            <DialogTitle asChild>
              <h2 className="font-medium text-ens-blue-midnight text-xl tracking-tight">
                <Trans>Enable Smart Sessions</Trans>
              </h2>
            </DialogTitle>
            <Button
              aria-label={t`Close dialog`}
              className="h-6 w-6 p-0"
              disabled={status === 'signing'}
              onClick={handleClose}
              size="icon"
              variant="ghost"
            >
              <X className="h-4 w-4 text-ens-gray" />
            </Button>
          </div>
          <DialogDescription className="sr-only">
            <Trans>
              Sign once to enable gasless transactions for your ENS operations.
            </Trans>
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
              <p className="text-ens-gray text-xs">
                <Trans>Smart Account</Trans>
              </p>
              <p className="font-mono text-ens-blue-midnight text-sm">
                {formatAddress(smartAccountAddress)}
              </p>
            </div>
          )}

          {/* Description */}
          <div className="text-center">
            {status === 'success' ? (
              <p className="text-green-600">
                <Trans>
                  Sessions enabled! You can now transact without signing each
                  time.
                </Trans>
              </p>
            ) : status === 'error' ? (
              <div className="flex flex-col gap-2">
                <p className="text-red-600">
                  {errorMessage || t`Something went wrong. Please try again.`}
                </p>
              </div>
            ) : status === 'signing' ? (
              <>
                <p className="text-ens-blue-midnight">
                  <Trans>Enabling sessions…</Trans>
                </p>
                <p className="mt-2 text-ens-gray text-sm">
                  <Trans>
                    Approve the signature in your wallet, then wait for on-chain
                    confirmation.
                  </Trans>
                </p>
              </>
            ) : (
              <>
                <p className="text-ens-blue-midnight">
                  <Trans>Sign once to enable seamless transactions.</Trans>
                </p>
                <p className="mt-2 text-ens-gray text-sm">
                  <Trans>
                    After signing, your ENS operations (registrations, renewals,
                    etc.) won&apos;t require additional wallet signatures.
                  </Trans>
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
                disabled={status === 'signing'}
                onClick={handleEnable}
              >
                {status === 'signing' ? (
                  <Trans>Enabling sessions…</Trans>
                ) : status === 'error' ? (
                  <Trans>Try Again</Trans>
                ) : (
                  <Trans>Enable Sessions</Trans>
                )}
              </Button>

              <Button
                className="h-11 w-full text-ens-gray hover:text-ens-blue-midnight"
                disabled={status === 'signing'}
                onClick={handleSkip}
                variant="ghost"
              >
                <Trans>Skip for now</Trans>
              </Button>
            </>
          )}
        </div>

        {/* Footer note */}
        {status === 'idle' && (
          <p className="text-center text-ens-gray text-xs">
            <Trans>This signature is free and doesn&apos;t cost any gas.</Trans>
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
