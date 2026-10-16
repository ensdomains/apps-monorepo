import type { HcaFundingPrompt } from '@ens-apps/transaction-manager'
import { Plural, Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'
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

/** An amount in a token's own units, e.g. `0.905736 USDC`. */
type TokenAmount = {
  readonly amount: bigint
  /** Defaults to USDC (6dp), the token every intent's fee is paid in. */
  readonly symbol?: string
  readonly decimals?: number
}

/** `formatUnits` trims trailing zeros, so 0.905736 shows exactly. */
const formatAmount = ({ amount, symbol = 'USDC', decimals = 6 }: TokenAmount) =>
  `${formatUnits(amount, decimals)} ${symbol}`

const min = (a: bigint, b: bigint) => (a < b ? a : b)

/** One cost line of the breakdown, above the account-balance offset. */
export interface HcaFundingLine extends TokenAmount {
  readonly label: ReactNode
}

/** What the account covers and what leaves the wallet, per token. */
const legsOf = (prompt: HcaFundingPrompt) => {
  const usdc = {
    symbol: 'USDC',
    decimals: 6,
    covered: min(
      prompt.hcaBalanceUsdc,
      prompt.requiredUsdc + prompt.quotedFeeUsdc,
    ),
    debit: prompt.permitValue,
    requiresPermit: prompt.requiresPermit,
  }
  const { token } = prompt
  return token
    ? [
        {
          symbol: token.symbol,
          decimals: token.decimals,
          covered: min(token.hcaBalance, token.required),
          debit: token.permitValue,
          requiresPermit: token.requiresPermit,
        },
        usdc,
      ]
    : [usdc]
}

interface HcaFundingConfirmDialogProps {
  /**
   * The quote to show, or `null` when nothing is pending. Rendering this is
   * what makes the amount visible BEFORE the wallet signature is requested —
   * the action is parked on the user's answer.
   */
  readonly prompt: HcaFundingPrompt | null
  /** What the payment is for. */
  readonly title: ReactNode
  /** What the payment buys; the dialog adds how the wallet authorizes it. */
  readonly description: ReactNode
  /** What the action costs, before what the account already holds. */
  readonly lines?: readonly HcaFundingLine[]
  /** Anything else the user needs to know to judge the figure. */
  readonly note?: ReactNode
  readonly onApprove: () => void
  readonly onDecline: () => void
}

/**
 * Shows what an intent moves out of the wallet, and takes the decision.
 *
 * The standalone-HCA route is user-paid: an action the account cannot cover
 * pulls the shortfall from the owner's wallet, under an EIP-2612 permit signed
 * for EXACTLY the figure shown or a standing allowance that already covers it.
 */
export const HcaFundingConfirmDialog = ({
  prompt,
  title,
  description,
  lines,
  note,
  onApprove,
  onDecline,
}: HcaFundingConfirmDialogProps) => {
  const legs = prompt ? legsOf(prompt) : []
  const covered = legs.filter((leg) => leg.covered > 0n)
  const debits = legs.filter((leg) => leg.debit > 0n)
  const permits = debits.filter((leg) => leg.requiresPermit).length

  return (
    <AlertDialog
      onOpenChange={(open) => {
        // Dismissing is declining: the submit call is parked until this
        // answers, so closing without a decision would hang it.
        if (!open) onDecline()
      }}
      open={!!prompt}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {description}{' '}
            {prompt && permits === 0 ? (
              <Trans>
                Your wallet has already given your smart account an allowance
                that covers this, so you won't be asked to approve it: the
                amount moves when you sign.
              </Trans>
            ) : (
              <Plural
                one="Your wallet will be asked to approve this exact amount — nothing more."
                other="Your wallet will be asked to approve these exact amounts — nothing more."
                value={permits}
              />
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {prompt && (
          <dl className="flex flex-col gap-2 rounded-md bg-ens-lapis-dust px-3 py-2.5 font-sans text-sm">
            {lines?.map((line, index) =>
              line.amount > 0n ? (
                <div
                  className="flex items-baseline justify-between gap-4"
                  // biome-ignore lint/suspicious/noArrayIndexKey: static cost lines, never reordered
                  key={index}
                >
                  <dt className="text-muted-foreground">{line.label}</dt>
                  <dd className="font-mono text-foreground">
                    {formatAmount(line)}
                  </dd>
                </div>
              ) : null,
            )}
            {covered.length > 0 && (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">
                  <Trans>Covered by your account balance</Trans>
                </dt>
                <dd className="flex flex-col items-end font-mono text-foreground">
                  {covered.map((leg) => (
                    <span key={leg.symbol}>
                      −{formatAmount({ ...leg, amount: leg.covered })}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {debits.map((leg, index) => (
              <div
                className={
                  index === 0
                    ? 'flex items-baseline justify-between gap-4 border-ens-gray-two border-t pt-2'
                    : 'flex items-baseline justify-between gap-4'
                }
                key={leg.symbol}
              >
                <dt className="font-medium text-foreground">
                  {leg.requiresPermit ? (
                    <Trans>You approve</Trans>
                  ) : (
                    <Trans>From your wallet</Trans>
                  )}
                </dt>
                <dd className="font-medium font-mono text-foreground">
                  {formatAmount({ ...leg, amount: leg.debit })}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {prompt && note && (
          <p className="font-sans text-muted-foreground text-xs">{note}</p>
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
}
