import type { HcaFundingPrompt } from '@ens-apps/transaction-manager'
import { Trans } from '@lingui/react/macro'
import { match } from 'ts-pattern'
import { Button } from '@/components/ui/button'
import { RenewalPaymentNote } from '@/features/renew/components/RenewalPaymentNote'
import { computeRenewalFunding } from '@/features/renew/utils/renewalFunding'
import { PaymentActionButton } from '@/features/shared/payment/components/PaymentActionButton'
import { PaymentReceipt } from '@/features/shared/payment/components/PaymentReceipt'

export const RenewalPaymentUpdate = ({
  label,
  isSigning,
  prompt,
  onApprove,
  onDecline,
}: {
  readonly isSigning: boolean
  readonly label: string
  readonly prompt: HcaFundingPrompt
  readonly onApprove: () => void
  readonly onDecline: () => void
}) => {
  const { summary } = computeRenewalFunding({
    funded: prompt.requiredUsdc,
    networkFee: prompt.quotedFeeUsdc,
    selectedToken: 'USDC',
    accountCredit: { USDC: prompt.hcaBalanceUsdc },
  })
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 pt-2 pb-6">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
        <PaymentReceipt flow="renewal" funding={summary} label={label} />
        <div className="flex flex-col gap-2 text-sm" role="status">
          <h3 className="font-medium text-ens-gray">
            <Trans>Renewal payment updated</Trans>
          </h3>
          <p className="text-ens-quartz-500">
            {isSigning ? (
              <Trans>
                Confirm the requests in your wallet to finish renewing.
              </Trans>
            ) : (
              <Trans>
                The amount due from your wallet increased. Review the updated
                total before signing.
              </Trans>
            )}
          </p>
          <RenewalPaymentNote />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <PaymentActionButton
          disabled={isSigning}
          isLoading={isSigning}
          onClick={onApprove}
        >
          {match({ isSigning, requiresPermit: prompt.requiresPermit })
            .with({ isSigning: true }, () => <Trans>Sign in wallet</Trans>)
            .with({ requiresPermit: true }, () => (
              <Trans>Sign payment approval</Trans>
            ))
            .otherwise(() => (
              <Trans>Sign renewal</Trans>
            ))}
        </PaymentActionButton>
        {!isSigning && (
          <Button onClick={onDecline} variant="ghost">
            <Trans>Cancel</Trans>
          </Button>
        )}
      </div>
    </div>
  )
}
