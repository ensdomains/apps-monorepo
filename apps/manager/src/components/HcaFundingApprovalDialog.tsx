import type { HcaFundingApprovalState } from '@ens-apps/transaction-manager'
import { Trans } from '@lingui/react/macro'
import { useLayoutEffect, useRef, useState } from 'react'
import { match } from 'ts-pattern'
import { formatUnits } from 'viem'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

/** Recovery and approval consent stay separate from the funding permit prompt. */
export const HcaFundingApprovalDialog = ({
  state,
  operation = 'renewal',
  onApprove,
  onDecline,
}: {
  readonly state: HcaFundingApprovalState
  readonly operation?: 'renewal' | 'registration'
  readonly onApprove: () => void
  readonly onDecline: () => void
}) => {
  const contentRef = useRef<HTMLDivElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const invokerRef = useRef<HTMLElement | null>(null)
  const [isRecoveryConfirmed, setIsRecoveryConfirmed] = useState(false)
  const prompt = state.kind === 'idle' ? null : state.prompt
  const isRecovery = state.kind === 'approval-recovery'
  const isPending =
    state.kind === 'approval-wallet' || state.kind === 'approval-receipt'
  useLayoutEffect(() => {
    if (isPending) contentRef.current?.focus({ preventScroll: true })
  }, [isPending])
  useLayoutEffect(() => {
    if (state.kind === 'approval-recovery') setIsRecoveryConfirmed(false)
  }, [state])
  const description = match(state.kind)
    .with('approval-recovery', () => (
      <Trans>
        Reject any waiting USDC approval request in your wallet. If a
        transaction was already sent, wait for that transaction or its
        cancellation to confirm before clearing. Clearing the app record does
        not cancel a wallet transaction. Any new approval will ask for your
        consent separately.
      </Trans>
    ))
    .with('approval-wallet', () =>
      operation === 'registration' ? (
        <Trans>
          Confirm the USDC approval transaction in your wallet. Registration
          will continue after it confirms.
        </Trans>
      ) : (
        <Trans>
          Confirm the USDC approval transaction in your wallet. The renewal will
          continue after it confirms.
        </Trans>
      ),
    )
    .with('approval-receipt', () =>
      operation === 'registration' ? (
        <Trans>
          Waiting for the USDC approval to confirm. Your registration has not
          been submitted yet.
        </Trans>
      ) : (
        <Trans>
          Waiting for the USDC approval to confirm. Your renewal has not been
          submitted yet.
        </Trans>
      ),
    )
    .otherwise(() =>
      operation === 'registration' ? (
        <Trans>
          Your wallet needs a separate transaction to approve USDC for your
          smart account. This costs ETH gas. After it confirms, sign the
          registration setup in your wallet. The registration will then
          continue.
        </Trans>
      ) : (
        <Trans>
          Your wallet needs a separate transaction to approve USDC for your
          smart account. This costs ETH gas. After it confirms, you can sign the
          renewal.
        </Trans>
      ),
    )
  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open && !isPending) onDecline()
      }}
      open={!!prompt}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (invokerRef.current?.isConnected)
            invokerRef.current.focus({ preventScroll: true })
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          const active = document.activeElement
          if (
            active instanceof HTMLElement &&
            !contentRef.current?.contains(active)
          )
            invokerRef.current = active
          const target = isRecovery ? cancelRef.current : contentRef.current
          target?.focus({ preventScroll: true })
        }}
        ref={contentRef}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isRecovery ? (
              <Trans>Resolve your earlier USDC approval</Trans>
            ) : operation === 'registration' ? (
              <Trans>Approve USDC for your registration?</Trans>
            ) : (
              <Trans>Approve USDC for your renewal?</Trans>
            )}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {prompt && (
          <dl className="flex flex-col gap-3 rounded-md bg-ens-lapis-dust px-3 py-2.5 font-sans text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt>
                {isRecovery ? (
                  <Trans>Earlier requested allowance</Trans>
                ) : (
                  <Trans>USDC allowance</Trans>
                )}
              </dt>
              <dd className="font-mono">
                {formatUnits(
                  state.kind === 'approval-recovery'
                    ? state.prompt.reservedAmount
                    : prompt.amount,
                  prompt.decimals,
                )}{' '}
                {prompt.symbol}
              </dd>
            </div>
            {!isRecovery && prompt.maxGasCost > 0n && (
              <div className="flex items-baseline justify-between gap-4">
                <dt>
                  <Trans>Maximum network fee</Trans>
                </dt>
                <dd className="font-mono">
                  {formatUnits(prompt.maxGasCost, 18)} {prompt.nativeSymbol}
                </dd>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">
                <Trans>Smart account receiving allowance</Trans>
              </dt>
              <dd className="break-all font-mono text-xs">{prompt.spender}</dd>
            </div>
          </dl>
        )}
        {isPending && (
          <p className="font-sans text-muted-foreground text-sm" role="status">
            {state.kind === 'approval-wallet' ? (
              <Trans>Waiting for your wallet</Trans>
            ) : (
              <Trans>Waiting for confirmation</Trans>
            )}
          </p>
        )}
        {isRecovery && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 font-sans text-sm">
            <input
              checked={isRecoveryConfirmed}
              className="size-4 shrink-0 accent-ens-lapis-core"
              onChange={(event) => setIsRecoveryConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span>
              <Trans>The earlier USDC approval is no longer pending.</Trans>
            </span>
          </label>
        )}
        <AlertDialogFooter className="flex-row md:ml-auto md:w-2/3">
          <Button
            className="flex-1/3 uppercase"
            disabled={isPending}
            onClick={onDecline}
            ref={cancelRef}
            size="lg"
            type="button"
            variant="outline"
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            className="flex-2/3 uppercase"
            disabled={isPending || (isRecovery && !isRecoveryConfirmed)}
            onClick={onApprove}
            size="lg"
            type="button"
          >
            {match(state.kind)
              .with('approval-recovery', () => <Trans>Clear and retry</Trans>)
              .with('approval-wallet', 'approval-receipt', () => (
                <Trans>Approving</Trans>
              ))
              .otherwise(() => (
                <Trans>Approve USDC</Trans>
              ))}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
