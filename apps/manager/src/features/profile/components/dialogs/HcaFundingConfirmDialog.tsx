import type { HcaFundingPrompt } from '@ens-apps/transaction-manager'
import { Trans } from '@lingui/react/macro'
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

/** USDC is 6dp. `formatUnits` trims trailing zeros, so 0.905736 shows exactly. */
const usdc = (amount: bigint): string => `${formatUnits(amount, 6)} USDC`

interface HcaFundingConfirmDialogProps {
  /**
   * The quote to show, or `null` when nothing is pending. Rendering this is
   * what makes the amount visible BEFORE the wallet signature is requested —
   * the action is parked on the user's answer.
   */
  readonly prompt: HcaFundingPrompt | null
  readonly onApprove: () => void
  readonly onDecline: () => void
}

/**
 * Shows the USDC a funding permit will authorize, and takes the decision.
 *
 * The standalone-HCA route is user-paid: an action the account cannot cover
 * pulls the shortfall from the owner's wallet with an EIP-2612 permit. The
 * permit is signed for EXACTLY the figure shown here — the wallet prompt that
 * follows asks for this amount and no more.
 */
export const HcaFundingConfirmDialog = ({
  prompt,
  onApprove,
  onDecline,
}: HcaFundingConfirmDialogProps) => (
  <AlertDialog
    onOpenChange={(open) => {
      // Dismissing is declining: the submit call is parked until this answers,
      // so closing without a decision would hang it.
      if (!open) onDecline()
    }}
    open={prompt !== null}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          <Trans>Approve the network fee?</Trans>
        </AlertDialogTitle>
        <AlertDialogDescription>
          <Trans>
            Setting a primary name is paid in USDC. Your wallet will be asked to
            approve this exact amount — nothing more.
          </Trans>
        </AlertDialogDescription>
      </AlertDialogHeader>

      {prompt && (
        <dl className="flex flex-col gap-2 rounded-md bg-ens-lapis-dust px-3 py-2.5 font-sans text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">
              <Trans>Network fee</Trans>
            </dt>
            <dd className="font-mono text-foreground">
              {usdc(prompt.quotedFeeUsdc)}
            </dd>
          </div>
          {prompt.hcaBalanceUsdc > 0n && (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">
                <Trans>Covered by your account balance</Trans>
              </dt>
              <dd className="font-mono text-foreground">
                −{usdc(prompt.hcaBalanceUsdc)}
              </dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-4 border-ens-gray-two border-t pt-2">
            <dt className="font-medium text-foreground">
              <Trans>You approve</Trans>
            </dt>
            <dd className="font-medium font-mono text-foreground">
              {usdc(prompt.permitValue)}
            </dd>
          </div>
        </dl>
      )}

      <AlertDialogFooter className="flex-row md:ml-auto md:w-2/3">
        <Button
          className="flex-1/3 uppercase"
          onClick={onDecline}
          size="lg"
          type="button"
          variant="outline"
        >
          <Trans>Cancel</Trans>
        </Button>
        <Button
          className="flex-2/3 uppercase"
          onClick={onApprove}
          size="lg"
          type="button"
        >
          <Trans>Approve</Trans>
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
