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
    <PaymentDialogBase
      onOpenChange={handleOpenChange}
      open={isOpen}
      registrationLayout
      title={''}
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
}: {
  open: boolean
  title?: string
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  registrationLayout?: boolean
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
