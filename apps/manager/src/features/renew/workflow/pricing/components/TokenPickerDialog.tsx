import { useLingui } from '@lingui/react/macro'
import { useSelector } from '@xstate/react'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import { useIsAwaitingRenewalApproval } from '@/features/renew/state/renewalUi.selectors'
import { PaymentDialogBase } from '@/features/shared/payment/components/PaymentDialog'
import { RenewalPaymentUpdate } from './RenewalPaymentUpdate'
import { TokenPickerContent } from './TokenPickerContent'

export const TokenPickerDialog = () => {
  const { t } = useLingui()
  const {
    uiActor,
    label,
    fundingPrompt,
    isFundingDecisionPending,
    approveFunding,
    declineFunding,
  } = useRenewalUiContext()

  const isPickingToken = useSelector(uiActor, (state) =>
    state.matches({ pricing: 'tokens' }),
  )
  const isAwaitingApproval = useIsAwaitingRenewalApproval(uiActor)

  return (
    <PaymentDialogBase
      isDismissible={!isAwaitingApproval || isFundingDecisionPending}
      onOpenChange={(open) => {
        if (!open && isFundingDecisionPending) {
          declineFunding()
        } else if (!open && isPickingToken) {
          uiActor.send({ type: 'pricing.step.previous' })
        }
      }}
      open={isPickingToken || isAwaitingApproval}
      registrationLayout
      title={fundingPrompt ? t`Renewal payment updated` : t`Review renewal`}
    >
      {fundingPrompt ? (
        <RenewalPaymentUpdate
          isSigning={!isFundingDecisionPending}
          label={label}
          onApprove={approveFunding}
          onDecline={declineFunding}
          prompt={fundingPrompt}
        />
      ) : (
        <TokenPickerContent />
      )}
    </PaymentDialogBase>
  )
}
