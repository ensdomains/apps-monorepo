import { useLingui } from '@lingui/react/macro'
import { useSelector } from '@xstate/react'
import { PaymentDialogBase } from '@/features/register-v2/workflow/pricing/components/TokenPickerDialog'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import { useIsAwaitingRenewalApproval } from '@/features/renew/state/renewalUi.selectors'
import { TokenPickerContent } from './TokenPickerContent'

export const TokenPickerDialog = () => {
  const { t } = useLingui()
  const { uiActor } = useRenewalUiContext()

  const isPickingToken = useSelector(uiActor, (state) =>
    state.matches({ pricing: 'tokens' }),
  )
  const isAwaitingApproval = useIsAwaitingRenewalApproval(uiActor)

  return (
    <PaymentDialogBase
      isDismissible={!isAwaitingApproval}
      onOpenChange={(open) => {
        if (!open && isPickingToken) {
          uiActor.send({ type: 'pricing.step.previous' })
        }
      }}
      open={isPickingToken || isAwaitingApproval}
      registrationLayout
      title={t`Approve and renew name`}
    >
      <TokenPickerContent />
    </PaymentDialogBase>
  )
}
