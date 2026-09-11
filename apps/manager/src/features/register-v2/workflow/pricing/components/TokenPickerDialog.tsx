import { useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'
import { usePricingStep } from '../../../state/registrationUi.selectors'
import { TokenPickerContent } from './TokenPickerContent'

export const TokenPickerDialog = () => {
  const { uiActor } = useRegistrationV2Context()

  const pricingStep = usePricingStep(uiActor)

  const isOpen = pricingStep === 'tokens'

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (pricingStep === 'tokens') {
        uiActor.send({ type: 'pricing.step.previous' })
      }
    }
  }

  return (
    <PaymentDialogBase onOpenChange={handleOpenChange} open={isOpen} title={''}>
      <TokenPickerContent />
    </PaymentDialogBase>
  )
}

export const PaymentDialogBase = ({
  open,
  title,
  onOpenChange,
  children,
}: {
  open: boolean
  title?: string
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) => {
  const panelRef = useRef<HTMLDivElement>(null)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex max-h-[90vh] min-h-[500px] flex-col"
        // The first focusable element here is an info button, and a tooltip
        // opens on focus: without this the sheet opens with a tooltip already
        // covering the price. Focus the panel itself instead, so the dialog
        // still takes focus from the page behind it.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          panelRef.current?.focus()
        }}
        ref={panelRef}
        showCloseButton={true}
      >
        <DialogHeader>
          <DialogTitle className="sr-only">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
