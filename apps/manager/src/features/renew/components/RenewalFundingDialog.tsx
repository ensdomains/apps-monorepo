import type { HcaFundingPrompt } from '@ens-apps/transaction-manager'
import { Trans } from '@lingui/react/macro'
import { HcaFundingConfirmDialog } from '@/components/HcaFundingConfirmDialog'

/** The funding prompt for a renewal intent: rent in its own token, fee in USDC. */
export const RenewalFundingDialog = ({
  prompt,
  onApprove,
  onDecline,
}: {
  readonly prompt: HcaFundingPrompt | null
  readonly onApprove: () => void
  readonly onDecline: () => void
}) => {
  const token = prompt?.token
  const symbol = token?.symbol

  return (
    <HcaFundingConfirmDialog
      description={
        token ? (
          <Trans>
            Renewals are paid out of your smart account: the price in {symbol},
            the network fee in USDC.
          </Trans>
        ) : (
          <Trans>Renewals are paid in USDC out of your smart account.</Trans>
        )
      }
      lines={[
        {
          // The rent plus the small headroom the renewer's approval carries,
          // because the price is re-read when the renewal executes.
          label: <Trans>Renewal price</Trans>,
          ...(token
            ? {
                amount: token.required,
                symbol: token.symbol,
                decimals: token.decimals,
              }
            : { amount: prompt?.requiredUsdc ?? 0n }),
        },
        {
          label: <Trans>Network fee</Trans>,
          amount: prompt?.quotedFeeUsdc ?? 0n,
        },
      ]}
      note={
        <Trans>
          The renewal price includes a 10% buffer: the final price is set when
          the renewal executes, slightly after this quote.
        </Trans>
      }
      onApprove={onApprove}
      onDecline={onDecline}
      prompt={prompt}
      title={<Trans>Approve the renewal payment?</Trans>}
    />
  )
}
