import type { HcaFundingApprovalState } from '@ens-apps/transaction-manager'
import { Trans } from '@lingui/react/macro'
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

/** Separate consent for an actual approval transaction; the funding permit prompt keeps its meaning. */
export const HcaFundingApprovalDialog = ({
  state,
  onApprove,
  onDecline,
}: {
  readonly state: HcaFundingApprovalState
  readonly onApprove: () => void
  readonly onDecline: () => void
}) => {
  const prompt = state.kind === 'idle' ? null : state.prompt
  const isPending =
    state.kind === 'approval-wallet' || state.kind === 'approval-receipt'
  const description = match(state.kind)
    .with('approval-wallet', () => (
      <Trans>
        Confirm the USDC approval transaction in your wallet. The renewal will
        continue after it confirms.
      </Trans>
    ))
    .with('approval-receipt', () => (
      <Trans>
        Waiting for the USDC approval to confirm. Your renewal has not been
        submitted yet.
      </Trans>
    ))
    .otherwise(() => (
      <Trans>
        Your wallet needs a separate transaction to approve USDC for your smart
        account. This costs ETH gas. After it confirms, you can sign the
        renewal.
      </Trans>
    ))
  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open && !isPending) onDecline()
      }}
      open={!!prompt}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Approve USDC for your renewal?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {prompt && (
          <dl className="flex flex-col gap-3 rounded-md bg-ens-lapis-dust px-3 py-2.5 font-sans text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt>
                <Trans>USDC allowance</Trans>
              </dt>
              <dd className="font-mono">
                {formatUnits(prompt.amount, prompt.decimals)} {prompt.symbol}
              </dd>
            </div>
            {prompt.maxGasCost > 0n && (
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
        <AlertDialogFooter className="flex-row md:ml-auto md:w-2/3">
          <Button
            className="flex-1/3 uppercase"
            disabled={isPending}
            onClick={onDecline}
            size="lg"
            type="button"
            variant="outline"
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            className="flex-2/3 uppercase"
            disabled={isPending}
            onClick={onApprove}
            size="lg"
            type="button"
          >
            {isPending ? <Trans>Approving</Trans> : <Trans>Approve USDC</Trans>}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
