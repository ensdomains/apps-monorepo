import { match, P } from 'ts-pattern'
import { DomainAttributePill } from '@/components/molecules/DomainResultCard/DomainAttributePill'
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
import type { PremiumLabel } from '@/features/register/utils'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { getByteLength, getDomainHeaderSizeClasses } from '@/utils/domain'
import { twm } from '@/utils/tailwind'
import {
  createRegistrationV2UiSelector,
  useRegistrationV2Context,
} from '../../machines/RegistrationV2UiContext'
import { ConfirmPayment } from './Confirm'
import { DurationSelector } from './Duration'
import { Payment } from './Payment'
import { PricingSummary } from './Summary'
import { TokensContent } from './Tokens'

const PricingDomainHeader = () => {
  const { label } = useRegistrationV2Context()

  const name = `${label}.eth`
  const sizeClasses = getDomainHeaderSizeClasses(getByteLength(name))

  const premiumLabel: PremiumLabel | undefined = match(label.length)
    .with(
      3,
      () =>
        ({ label: '3 character premium name', variant: 'premium-3' }) as const,
    )
    .with(
      4,
      () =>
        ({ label: '4 character premium name', variant: 'premium-4' }) as const,
    )
    .otherwise(() => undefined)

  return (
    <div className="flex flex-col items-center gap-2 text-center md:items-start md:text-left">
      {premiumLabel && (
        <DomainAttributePill
          label={premiumLabel.label}
          variant={premiumLabel.variant}
        />
      )}
      <h1
        className={twm(
          'font-semi-mono text-ens-blue-midnight leading-tight tracking-tighter',
          'min-h-0 w-full break-words',
          sizeClasses,
        )}
        title={name}
      >
        {name}
      </h1>
    </div>
  )
}

export function PricingStep() {
  return (
    <div className="mx-auto h-screen w-full max-w-6xl">
      <PricingDomainHeader />

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[2fr_420px] lg:items-stretch">
        {/* Left Column: Duration Selector */}
        <DurationSelector />

        {/* Right Column: Summary */}
        <div className="flex flex-col gap-2">
          <PricingSummary />
          <Payment />
        </div>
      </div>
      <PopUp />
    </div>
  )
}

const usePricingStep = createRegistrationV2UiSelector((state) =>
  match(state.value)
    .with({ pricing: P.string }, (step) => step.pricing)
    .otherwise(() => undefined),
)

const PopUp = () => {
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
    .with('tokens', () => 'Select coin')
    .with('confirm', () => 'Confirm purchase')
    .otherwise(() => undefined)

  const content = match(pricingStep)
    .with('tokens', () => <TokensContent />)
    .with('confirm', () => <ConfirmPayment />)
    .otherwise(() => undefined)

  // Desktop Dialog
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

  // Mobile Drawer
  return (
    <Drawer onOpenChange={handleOpenChange} open={isOpen}>
      <DrawerContent>
        <DrawerHeader className="px-4 pt-5 pb-5 text-left">
          <DrawerTitle className="sr-only">{header}</DrawerTitle>
        </DrawerHeader>
        {content}
      </DrawerContent>
    </Drawer>
  )
}
