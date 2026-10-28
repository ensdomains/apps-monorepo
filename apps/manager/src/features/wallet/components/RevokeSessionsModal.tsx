'use client'

import { Trans } from '@lingui/react/macro'
import { Loader2, ShieldOff } from 'lucide-react'
import { match, P } from 'ts-pattern'
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
  /**
   * Resolves true once the revoke receipt confirms. `deployFirst` asks for the
   * account to be deployed in a transaction of its own before the revoke.
   */
  onRevokeSessions: (options?: { deployFirst?: boolean }) => Promise<boolean>
  /** True while the owner's revoke (or deployment) transaction is in flight. */
  isRevoking?: boolean
  /** Localized revocation error, if the last attempt failed. */
  errorMessage?: string | null
  /** True when the last attempt failed because the account is undeployed. */
  isUndeployed?: boolean
  /** Formatted balance sent back to the wallet after the reset, if any. */
  readonly leftoverFunds?: string | null
  /** True while that follow-up withdrawal is in flight. */
  readonly isWithdrawing?: boolean
  /** A pending registration that needs the balance, so it stays put. */
  readonly leftoverFundsHeldFor?: string | null
}

const LeftoverFundsNote = ({
  leftoverFunds,
  heldFor,
}: {
  readonly leftoverFunds: string
  readonly heldFor: string | null
}) => (
  <p className="mt-2 text-ens-gray text-sm">
    {heldFor ? (
      <Trans>
        Your smart account also holds {leftoverFunds}, which your registration
        of {heldFor} needs to complete. It stays there, and you can withdraw
        what's left once the registration is done.
      </Trans>
    ) : (
      <Trans>
        Your smart account also holds {leftoverFunds} left over from earlier
        payments. It will be sent back to your wallet in one more transaction.
      </Trans>
    )}
  </p>
)

/**
 * Confirm the owner-signed on-chain session revocation.
 *
 * A confirm step rather than a one-click menu action, because the app cannot
 * sponsor it: it is a direct owner transaction and costs gas. Any leftover
 * balance follows in a second one, so the reset never strands funds. The copy has to say so before the wallet opens, and has to be
 * clear that it applies to every session signed for the account rather than
 * just this browser's.
 */
export const RevokeSessionsModal = ({
  open,
  onOpenChange,
  onRevokeSessions,
  isRevoking = false,
  errorMessage = null,
  isUndeployed = false,
  leftoverFunds = null,
  isWithdrawing = false,
  leftoverFundsHeldFor = null,
}: RevokeSessionsModalProps) => {
  const isBusy = isRevoking || isWithdrawing
  const handleRevoke = async () => {
    if (isBusy) return
    const revoked = await onRevokeSessions(
      isUndeployed ? { deployFirst: true } : undefined,
    )
    // Leave the dialog open on failure so the error stays visible.
    if (revoked) onOpenChange(false)
  }

  return (
    <Dialog onOpenChange={isBusy ? () => {} : onOpenChange} open={open}>
      <DialogContent className="max-w-md border-ens-gray-two p-6">
        <DialogHeader>
          <DialogTitle asChild>
            <h2 className="font-medium text-ens-blue-midnight text-xl tracking-tight">
              <Trans>Reset smart session access</Trans>
            </h2>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex size-16 items-center justify-center rounded-full bg-ens-gray-one">
            {isBusy ? (
              <Loader2 className="size-8 animate-spin text-ens-blue" />
            ) : (
              <ShieldOff className="size-8 text-ens-blue" />
            )}
          </div>

          <div className="text-center">
            <p className="text-ens-blue-midnight">
              <Trans>
                If you think a smart session has been compromised, reset access
                to revoke all existing smart sessions for this account on this
                network, across every browser and device.
              </Trans>
            </p>
            <p className="mt-2 text-ens-gray text-sm">
              {isUndeployed ? (
                <Trans>
                  It takes two transactions from your wallet, one to set up the
                  account and one to reset access. Both require ETH for gas. You
                  will need to enable a new smart session afterwards.
                </Trans>
              ) : (
                <Trans>
                  Resetting access requires a wallet transaction and ETH for
                  gas. You will need to enable a new smart session afterwards.
                </Trans>
              )}
            </p>
            {leftoverFunds && (
              <LeftoverFundsNote
                heldFor={leftoverFundsHeldFor}
                leftoverFunds={leftoverFunds}
              />
            )}
          </div>

          {errorMessage && (
            <p className="text-center text-red-600 text-sm">{errorMessage}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            className={cn(
              'h-11 w-full rounded bg-ens-blue font-medium font-mono text-sm text-white uppercase tracking-wider',
              'hover:bg-ens-blue-hover',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
            disabled={isBusy}
            onClick={() => void handleRevoke()}
            type="button"
          >
            {match({ isWithdrawing, isRevoking, isUndeployed, errorMessage })
              .with({ isWithdrawing: true }, () => (
                <Trans>Returning leftover funds…</Trans>
              ))
              .with({ isRevoking: true }, () => (
                <Trans>Resetting access…</Trans>
              ))
              .with({ isUndeployed: true }, () => (
                <Trans>Set up and reset access</Trans>
              ))
              .with({ errorMessage: P.string.minLength(1) }, () => (
                <Trans>Try Again</Trans>
              ))
              .otherwise(() => (
                <Trans>Reset access</Trans>
              ))}
          </Button>
          <Button
            className="h-11 w-full rounded font-medium font-mono text-sm uppercase tracking-wider"
            disabled={isBusy}
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
