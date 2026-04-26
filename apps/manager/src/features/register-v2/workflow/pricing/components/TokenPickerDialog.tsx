import { useLingui } from '@lingui/react/macro'
import { match } from 'ts-pattern'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'
import { usePricingStep } from '../../../state/registrationUi.selectors'
import { ConfirmPurchase } from './ConfirmPurchase'
import { TokenPickerContent } from './TokenPickerContent'

export const TokenPickerDialog = () => {
  const { t } = useLingui()
  const { uiActor } = useRegistrationV2Context()

  const pricingStep = usePricingStep(uiActor)

  const isOpen = pricingStep === 'tokens' || pricingStep === 'confirm'

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (pricingStep === 'confirm') {
        uiActor.send({ type: 'pricing.dialog.dismiss' })
      } else if (pricingStep === 'tokens') {
        uiActor.send({ type: 'pricing.step.previous' })
      }
    }
  }

  return (
    <PaymentDialogBase
      onOpenChange={handleOpenChange}
      open={isOpen}
      title={match(pricingStep)
        .with('tokens', () => t`Select coin`)
        .with('confirm', () => t`Confirm purchase`)
        .otherwise(() => undefined)}
    >
      {match(pricingStep)
        .with('tokens', () => <TokenPickerContent />)
        .with('confirm', () => <ConfirmPurchase />)
        .otherwise(() => undefined)}
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
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  if (isDesktop) {
    return (
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="min-h-[500px]" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle className="sr-only">{title}</DialogTitle>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent className="h-full pb-4">
        <DrawerHeader>
          <DrawerTitle className="sr-only">{title}</DrawerTitle>
        </DrawerHeader>
        {children}
      </DrawerContent>
    </Drawer>
  )
}
