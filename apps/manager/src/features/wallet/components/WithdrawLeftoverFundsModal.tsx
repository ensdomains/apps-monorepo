'use client'

import { Trans } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { ArrowDownToLine, Loader2 } from 'lucide-react'
import { match, P } from 'ts-pattern'
import { formatUnits } from 'viem'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { LeftoverFundsStatus } from '@/features/wallet/data/queries/leftoverFunds.query'
import { cn } from '@/lib/utils'

type WithdrawNoteProps = {
  readonly leftover: LeftoverFundsStatus
  readonly onContinueRegistration: () => void
}

/** What withdrawing takes, or why it has to wait. */
const WithdrawNote = ({
  leftover,
  onContinueRegistration,
}: WithdrawNoteProps) =>
  match(leftover)
    .with({ heldForRegistration: P.string }, ({ heldForRegistration }) => (
      <p className="text-center text-ens-blue-midnight text-sm">
        <Trans>
          Your registration of {heldForRegistration} is waiting to complete and
          needs these funds. You can withdraw what's left once it's done.
        </Trans>{' '}
        <Link
          className="text-ens-blue underline"
          onClick={onContinueRegistration}
          params={{ name: heldForRegistration }}
          to="/register/$name"
        >
          <Trans>Continue registration</Trans>
        </Link>
      </p>
    ))
    .with({ isDeployed: true }, () => (
      <p className="text-center text-ens-gray text-sm">
        <Trans>
          Withdrawing requires a wallet transaction and ETH for gas.
        </Trans>
      </p>
    ))
    .otherwise(() => (
      <p className="text-center text-ens-gray text-sm">
        <Trans>
          It takes two transactions from your wallet, one to set up the account
          and one to withdraw. Both require ETH for gas.
        </Trans>
      </p>
    ))

type WithdrawLeftoverFundsModalProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  /** Resolves true once the withdrawal confirms. */
  readonly onWithdraw: () => Promise<boolean>
  /** Called when the user leaves to finish the registration holding the funds. */
  readonly onContinueRegistration: () => void
  /** Undefined until the balance has been read. */
  readonly leftover?: LeftoverFundsStatus
  readonly isLoading?: boolean
  readonly isError?: boolean
  readonly isWithdrawing?: boolean
  /** Localized withdrawal error, if the last attempt failed. */
  readonly errorMessage?: string | null
}

/**
 * Confirm sending the smart account's leftover balance back to the wallet.
 * A direct owner transaction that costs gas, so the copy says so before the
 * wallet opens.
 */
export const WithdrawLeftoverFundsModal = ({
  open,
  onOpenChange,
  onWithdraw,
  onContinueRegistration,
  leftover,
  isLoading = false,
  isError = false,
  isWithdrawing = false,
  errorMessage = null,
}: WithdrawLeftoverFundsModalProps) => {
  const hasFunds = (leftover?.funds.length ?? 0) > 0
  const canWithdraw = hasFunds && !leftover?.heldForRegistration

  const handleWithdraw = async () => {
    if (isWithdrawing) return
    // Leave the dialog open on failure so the error stays visible.
    if (await onWithdraw()) onOpenChange(false)
  }

  return (
    <Dialog onOpenChange={isWithdrawing ? () => {} : onOpenChange} open={open}>
      <DialogContent className="max-w-md border-ens-gray-two p-6">
        <DialogHeader>
          <DialogTitle asChild>
            <h2 className="font-medium text-ens-blue-midnight text-xl tracking-tight">
              <Trans>Withdraw leftover funds</Trans>
            </h2>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex size-16 items-center justify-center rounded-full bg-ens-gray-one">
            {isWithdrawing ? (
              <Loader2 className="size-8 animate-spin text-ens-blue" />
            ) : (
              <ArrowDownToLine className="size-8 text-ens-blue" />
            )}
          </div>

          <p className="text-center text-ens-blue-midnight">
            <Trans>
              Your payments go through your smart account, which is topped up
              for the highest quoted cost. Anything that isn't spent stays
              there. You can send it back to your wallet at any time.
            </Trans>
          </p>

          <div className="w-full rounded-md bg-ens-lapis-dust px-3 py-2.5 text-sm">
            {match({ leftover, isError })
              .with({ leftover: P.nonNullable }, ({ leftover }) =>
                leftover.funds.length > 0 ? (
                  <dl className="flex flex-col gap-1">
                    {leftover.funds.map((fund) => (
                      <div
                        className="flex items-baseline justify-between gap-4"
                        key={fund.token}
                      >
                        <dt className="text-muted-foreground">{fund.symbol}</dt>
                        <dd className="font-mono text-foreground">
                          {formatUnits(fund.amount, fund.decimals)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-center text-muted-foreground">
                    <Trans>Your smart account has no leftover funds.</Trans>
                  </p>
                ),
              )
              .with({ isError: true }, () => (
                <p className="text-center text-red-600">
                  <Trans>Couldn't load your smart account balance.</Trans>
                </p>
              ))
              .otherwise(() => (
                <p className="text-center text-muted-foreground">
                  <Trans>Checking your smart account balance…</Trans>
                </p>
              ))}
          </div>

          {leftover && hasFunds && (
            <WithdrawNote
              leftover={leftover}
              onContinueRegistration={onContinueRegistration}
            />
          )}

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
            disabled={isWithdrawing || isLoading || !canWithdraw}
            onClick={() => void handleWithdraw()}
            type="button"
          >
            {isWithdrawing ? (
              <Trans>Withdrawing…</Trans>
            ) : errorMessage ? (
              <Trans>Try Again</Trans>
            ) : (
              <Trans>Withdraw to wallet</Trans>
            )}
          </Button>
          <Button
            className="h-11 w-full rounded font-medium font-mono text-sm uppercase tracking-wider"
            disabled={isWithdrawing}
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
