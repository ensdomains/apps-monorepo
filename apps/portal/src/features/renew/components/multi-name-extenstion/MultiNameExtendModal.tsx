import { useState } from 'react'
import { match } from 'ts-pattern'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getDurationInSecondsFromYears } from '@/features/register/utils/registrationDuration'
import { useMultiNamePricing } from '../../hooks/useMultiNamePricing'
import type { SelectedName } from '../../hooks/useRenewalTransactions'
import { ExtendNameDisclaimer } from '../ExtendNameDisclaimer'
import { MultiNameExtendSettings } from './MultiNameExtendSettings'
import { MultiNameExtendSummary } from './MultiNameExtendSummary'

type MultiNameExtendModalProps = {
  readonly open: boolean
  readonly onClose: () => void
  readonly selectedNames: SelectedName[]
}

export type MultiNameExtendModalStep =
  | 'disclaimer'
  | 'settings'
  | 'summary'
  | 'confirm'
  | 'success'

export const MultiNameExtendModal = ({
  open,
  onClose,
  selectedNames,
}: MultiNameExtendModalProps) => {
  const [step, setStep] = useState<MultiNameExtendModalStep>('disclaimer')
  const [duration, setDuration] = useState<number>(() =>
    getDurationInSecondsFromYears(1),
  )

  const { pricingData, total, totalDiscount, allLoaded } = useMultiNamePricing(
    selectedNames,
    duration,
  )

  const stepTitle = match(step)
    .with('disclaimer', () => undefined)
    .with('settings', () => 'Extend names')
    .with('summary', () => 'Confirm extension')
    .with('confirm', () => 'Confirm extension')
    .with('success', () => undefined)
    .exhaustive()

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose()
        }
        setStep('disclaimer')
      }}
    >
      <DialogContent className="sm:max-w-[460px] max-h-[80vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <DialogHeader className={stepTitle ? '' : 'sr-only'}>
          <DialogTitle className="text-xl">{stepTitle}</DialogTitle>
        </DialogHeader>
        {match(step)
          .with('disclaimer', () => (
            <ExtendNameDisclaimer onContinue={() => setStep('settings')} />
          ))
          .with('settings', () => (
            <MultiNameExtendSettings
              pricingData={pricingData}
              total={total}
              totalDiscount={totalDiscount}
              allLoaded={allLoaded}
              duration={duration}
              setDuration={setDuration}
              onBack={() => setStep('disclaimer')}
              onNext={() => setStep('summary')}
            />
          ))
          .with('summary', () => (
            <MultiNameExtendSummary
              pricingData={pricingData}
              total={total}
              totalDiscount={totalDiscount}
              allLoaded={allLoaded}
              onBack={() => setStep('settings')}
              onNext={() => setStep('confirm')}
            />
          ))
          .with('confirm', () => null)
          .with('success', () => null)
          .exhaustive()}
      </DialogContent>
    </Dialog>
  )
}
