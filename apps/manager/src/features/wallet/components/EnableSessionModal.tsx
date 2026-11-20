'use client'

import { Trans, useLingui } from '@lingui/react/macro'
import { Loader2 } from 'lucide-react'
import { match } from 'ts-pattern'
import { EnsMobileIcon } from '@/assets/icons/ens-mobile-icon'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SESSION_SIGNER_MISMATCH_MESSAGE } from '@/lib/smart-account/sessionMessages'

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
      <DialogContent className="gap-6 border-ens-gray-two p-6 sm:max-w-sm sm:p-8">
        <DialogHeader className="items-center gap-0 text-center sm:text-center">
          <div className="mb-5 flex h-12 items-center justify-center text-ens-blue">
            {status === 'signing' ? (
              <Loader2 className="size-10 animate-spin" />
            ) : (
              <EnsMobileIcon className="h-12 w-11" />
            )}
          </div>
          <DialogTitle className="font-medium text-ens-blue-midnight text-xl tracking-tight">
            <Trans>Enable Smart Sessions</Trans>
          </DialogTitle>
          {status === 'error' && (
            <p className="mt-2 font-medium text-destructive text-sm">
              <Trans>The session wasn&apos;t enabled.</Trans>
            </p>
          )}
          <DialogDescription className="mt-2 text-balance text-ens-gray text-sm leading-normal">
            {match(status)
              .with('signing', () => (
                <Trans>
                  Approve the signature in your wallet, then wait for on-chain
                  confirmation.
                </Trans>
              ))
              .with('error', () =>
                failure === 'signer-mismatch' ? (
                  t(SESSION_SIGNER_MISMATCH_MESSAGE)
                ) : (
                  <Trans>
                    You can keep browsing, but registering or managing names
                    needs a session.
                    <br />
                    Try again when you&apos;re ready.
                  </Trans>
                ),
              )
              .with('idle', () => (
                <Trans>
                  Sign once to skip wallet prompts for registrations and
                  renewals.
                  <br />
                  It&apos;s free and costs no gas.
                </Trans>
              ))
              .exhaustive()}
          </DialogDescription>
        </DialogHeader>

        <Button
          className="w-full bg-ens-blue uppercase tracking-wider hover:bg-ens-blue-hover"
          disabled={status === 'signing'}
          onClick={handleEnable}
          size="lg"
          type="button"
        >
          {match(status)
            .with('signing', () => <Trans>Enabling sessions…</Trans>)
            .with('error', () => <Trans>Try Again</Trans>)
            .with('idle', () => <Trans>Enable Sessions</Trans>)
            .exhaustive()}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
