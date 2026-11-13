'use client'

import { Trans, useLingui } from '@lingui/react/macro'
import { BrainCircuit, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SESSION_SIGNER_MISMATCH_MESSAGE } from '@/lib/smart-account/sessionMessages'
import { cn } from '@/lib/utils'

/** Why the last attempt in this dialog failed. */
export type EnableSessionFailure = 'failed' | 'signer-mismatch'

type EnableSessionModalProps = {
  readonly open: boolean
  /** Close control, Escape or a click outside: the page stays usable without a session. */
  readonly onDismiss: () => void
  readonly onEnableSession: () => Promise<void>
  /** True while the ENABLE signature is in flight. */
  readonly isEnabling?: boolean
  /** Set when the last attempt in this dialog failed. */
  readonly failure?: EnableSessionFailure | null
}

export const EnableSessionModal = ({
  open,
  onDismiss,
  onEnableSession,
  isEnabling = false,
  failure = null,
}: EnableSessionModalProps) => {
  const { t } = useLingui()
  const status: 'idle' | 'signing' | 'error' = (() => {
    if (isEnabling) return 'signing'
    if (failure) return 'error'
    return 'idle'
  })()

  const handleEnable = async () => {
    if (status === 'signing') return
    try {
      await onEnableSession()
    } catch (error) {
      console.error('Failed to enable session:', error)
    }
  }

  return (
    <Dialog
      onOpenChange={(isOpen) => {
        if (!isOpen) onDismiss()
      }}
      open={open}
    >
      <DialogContent className="max-w-md border-ens-gray-two p-6">
        <DialogHeader>
          <DialogTitle asChild>
            <h2 className="font-medium text-ens-blue-midnight text-xl tracking-tight">
              <Trans>Enable Smart Sessions</Trans>
            </h2>
          </DialogTitle>
          <DialogDescription className="sr-only">
            <Trans>
              Sign once to enable gasless transactions for your ENS operations.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ens-blue/10">
            {status === 'signing' ? (
              <Loader2 className="animate-spin text-ens-blue" size={32} />
            ) : (
              <BrainCircuit className="text-ens-blue" size={32} />
            )}
          </div>

          <div className="text-center">
            {status === 'error' ? (
              <div className="flex flex-col gap-2">
                <p className="font-medium text-ens-blue-midnight">
                  <Trans>The session wasn&apos;t enabled.</Trans>
                </p>
                <p className="text-ens-gray text-sm">
                  {failure === 'signer-mismatch' ? (
                    t(SESSION_SIGNER_MISMATCH_MESSAGE)
                  ) : (
                    <Trans>
                      You can keep browsing, but registering or managing names
                      needs a session. Try again when you&apos;re ready.
                    </Trans>
                  )}
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

        <div className="flex flex-col gap-2">
          <Button
            className={cn(
              'h-11 w-full rounded bg-ens-blue font-medium font-mono text-sm text-white uppercase tracking-wider',
              'hover:bg-ens-blue-hover',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
            disabled={status === 'signing'}
            onClick={handleEnable}
            type="button"
          >
            {status === 'signing' ? (
              <Trans>Enabling sessions…</Trans>
            ) : status === 'error' ? (
              <Trans>Try Again</Trans>
            ) : (
              <Trans>Enable Sessions</Trans>
            )}
          </Button>
        </div>

        {status === 'idle' && (
          <div className="flex flex-col items-center gap-1">
            <p className="text-center text-ens-gray text-xs">
              <Trans>
                This signature is free and doesn&apos;t cost any gas.
              </Trans>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
