import { useLingui } from '@lingui/react/macro'
import { useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
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
      title={t`Approve and register name`}
    >
      <TokenPickerContent />
    </PaymentDialogBase>
  )
}

export const PaymentDialogBase = ({
  open,
  title,
  onOpenChange,
  children,
  registrationLayout = false,
  isDismissible = true,
}: {
  open: boolean
  title?: string
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  registrationLayout?: boolean
  readonly isDismissible?: boolean
}) => {
  const panelRef = useRef<HTMLDivElement>(null)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className={cn(
          'flex flex-col',
          registrationLayout
            ? 'max-h-[90dvh] min-h-0 sm:min-h-[500px]'
            : 'max-h-[90vh] min-h-[500px]',
        )}
        onEscapeKeyDown={
          isDismissible ? undefined : (event) => event.preventDefault()
        }
        onInteractOutside={
          isDismissible ? undefined : (event) => event.preventDefault()
        }
        // The first focusable element here is an info button, and a tooltip
        // opens on focus: without this the sheet opens with a tooltip already
        // covering the price. Focus the panel itself instead, so the dialog
        // still takes focus from the page behind it.
        onOpenAutoFocus={
          registrationLayout
            ? (event) => {
                event.preventDefault()
                panelRef.current?.focus()
              }
            : undefined
        }
        ref={panelRef}
        showCloseButton={isDismissible}
      >
        <DialogHeader>
          <DialogTitle className="sr-only">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
