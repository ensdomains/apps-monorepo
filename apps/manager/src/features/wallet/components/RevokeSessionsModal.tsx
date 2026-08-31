'use client'

import { Trans } from '@lingui/react/macro'
import { Loader2, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type RevokeSessionsModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Resolves true once the revoke receipt confirms. */
  onRevokeSessions: () => Promise<boolean>
  smartAccountAddress?: string
  /** True while the owner's revoke transaction is in flight. */
  isRevoking?: boolean
  /** Localized revocation error, if the last attempt failed. */
  errorMessage?: string | null
  /** True when the failure was an undeployed account (nothing to revoke). */
  isUndeployed?: boolean
  /** Clear this browser's saved session. Not revocation — see the copy. */
  onForgetLocalSession?: () => void
}

/**
 * Confirm the owner-signed on-chain session revocation.
 *
 * A confirm step rather than a one-click menu action, because this is the one
 * account operation the app cannot sponsor: it is a direct owner transaction
 * and costs gas. The copy has to say so before the wallet opens, and has to be
 * clear that it applies to every session on the account rather than just this
 * browser.
 */
export const RevokeSessionsModal = ({
  open,
  onOpenChange,
  onRevokeSessions,
  smartAccountAddress,
  isRevoking = false,
  errorMessage = null,
  isUndeployed = false,
  onForgetLocalSession,
}: RevokeSessionsModalProps) => {
  const formatAddress = (address?: string) => {
    if (!address) return ''
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const handleRevoke = async () => {
    if (isRevoking) return
    const revoked = await onRevokeSessions()
    // Leave the dialog open on failure so the error stays visible.
    if (revoked) onOpenChange(false)
  }

  return (
    <Dialog onOpenChange={isRevoking ? () => {} : onOpenChange} open={open}>
      <DialogContent className="max-w-md border-ens-gray-two p-6">
        <DialogHeader>
          <DialogTitle asChild>
            <h2 className="font-medium text-ens-blue-midnight text-xl tracking-tight">
              <Trans>Revoke smart sessions</Trans>
            </h2>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex size-16 items-center justify-center rounded-full bg-ens-gray-one">
            {isRevoking ? (
              <Loader2 className="size-8 animate-spin text-ens-blue" />
            ) : (
              <ShieldOff className="size-8 text-ens-blue" />
            )}
          </div>

          {smartAccountAddress && (
            <div className="text-center">
              <p className="text-ens-gray text-xs">
                <Trans>Smart account</Trans>
              </p>
              <p className="font-mono text-ens-blue-midnight text-sm">
                {formatAddress(smartAccountAddress)}
              </p>
            </div>
          )}

          <div className="text-center">
            <p className="text-ens-blue-midnight">
              <Trans>
                This ends every active session for this account, on every
                device.
              </Trans>
            </p>
            <p className="mt-2 text-ens-gray text-sm">
              <Trans>
                Unlike enabling a session, this is a transaction from your
                wallet, so it costs gas. Your next registration will ask you to
                sign a new session.
              </Trans>
            </p>
          </div>

          {errorMessage && (
            <p className="text-center text-red-600 text-sm">{errorMessage}</p>
          )}

          {/* An undeployed account has no on-chain session to revoke, so the
              stored record is the whole exposure. Offer to clear it rather
              than dead-ending — but never call that a revocation: a copy taken
              off this device still works once the account is deployed. */}
          {isUndeployed && onForgetLocalSession && (
            <p className="text-center text-ens-gray text-sm">
              <Trans>
                You can remove the saved session from this browser. If you think
                it was copied elsewhere, revoke again after your first
                registration.
              </Trans>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            className={cn(
              'h-11 w-full rounded bg-ens-blue font-medium font-mono text-sm text-white uppercase tracking-wider',
              'hover:bg-ens-blue-hover',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
            disabled={isRevoking}
            onClick={() => void handleRevoke()}
            type="button"
          >
            {isRevoking ? (
              <Trans>Revoking…</Trans>
            ) : errorMessage ? (
              <Trans>Try Again</Trans>
            ) : (
              <Trans>Revoke sessions</Trans>
            )}
          </Button>
          {isUndeployed && onForgetLocalSession && (
            <Button
              className="h-11 w-full rounded font-medium font-mono text-sm uppercase tracking-wider"
              disabled={isRevoking}
              onClick={() => {
                onForgetLocalSession()
                onOpenChange(false)
              }}
              type="button"
              variant="secondary"
            >
              <Trans>Remove saved session</Trans>
            </Button>
          )}
          <Button
            className="h-11 w-full rounded font-medium font-mono text-sm uppercase tracking-wider"
            disabled={isRevoking}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            <Trans>Cancel</Trans>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
