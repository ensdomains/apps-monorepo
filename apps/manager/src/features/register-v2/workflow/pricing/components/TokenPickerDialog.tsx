import { useLingui } from '@lingui/react/macro'
import { PaymentDialogBase } from '@/features/shared/payment/components/PaymentDialog'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'
import { usePricingStep } from '../../../state/registrationUi.selectors'
import { TokenPickerContent } from './TokenPickerContent'

export const TokenPickerDialog = () => {
  const { t } = useLingui()
  const { uiActor } = useRegistrationV2Context()

  const pricingStep = usePricingStep(uiActor)

  const isApproving = pricingStep === 'approving'
  const isOpen = pricingStep === 'tokens' || isApproving

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (pricingStep === 'tokens') {
        uiActor.send({ type: 'pricing.step.previous' })
      }
    }
  }

  return (
    <PaymentDialogBase
      isDismissible={!isApproving}
      onOpenChange={handleOpenChange}
      open={isOpen}
      registrationLayout
      title={t`Review registration`}
    >
      <TokenPickerContent />
    </PaymentDialogBase>
  )
}
