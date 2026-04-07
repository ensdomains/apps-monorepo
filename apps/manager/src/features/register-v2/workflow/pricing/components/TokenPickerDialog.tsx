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
  const isDesktop = useMediaQuery('(min-width: 1024px)')

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

  const header = match(pricingStep)
    .with('tokens', () => t`Select coin`)
    .with('confirm', () => t`Confirm purchase`)
    .otherwise(() => undefined)

  const content = match(pricingStep)
    .with('tokens', () => <TokenPickerContent />)
    .with('confirm', () => <ConfirmPurchase />)
    .otherwise(() => undefined)

  if (isDesktop) {
    return (
      <Dialog onOpenChange={handleOpenChange} open={isOpen}>
        <DialogContent className="min-h-[500px]" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle className="sr-only">{header}</DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer onOpenChange={handleOpenChange} open={isOpen}>
      <DrawerContent className="h-full pb-4">
        <DrawerHeader>
          <DrawerTitle className="sr-only">{header}</DrawerTitle>
        </DrawerHeader>
        {content}
      </DrawerContent>
    </Drawer>
  )
}
