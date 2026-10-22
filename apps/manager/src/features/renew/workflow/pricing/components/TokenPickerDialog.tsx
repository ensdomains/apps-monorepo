import { useLingui } from '@lingui/react/macro'
import { useSelector } from '@xstate/react'
import { PaymentDialogBase } from '@/features/register-v2/workflow/pricing/components/TokenPickerDialog'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import { TokenPickerContent } from './TokenPickerContent'

export const TokenPickerDialog = () => {
  const { t } = useLingui()
  const { uiActor } = useRenewalUiContext()

  const isOpen = useSelector(uiActor, (state) =>
    state.matches({ pricing: 'tokens' }),
  )

  return (
    <PaymentDialogBase
      onOpenChange={(open) => {
        if (!open) uiActor.send({ type: 'pricing.step.previous' })
      }}
      open={isOpen}
      registrationLayout
      title={t`Approve and renew name`}
    >
      <TokenPickerContent />
    </PaymentDialogBase>
  )
}
