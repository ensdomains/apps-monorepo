import { useState } from 'react'
import { match } from 'ts-pattern'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getDurationInSecondsFromYears } from '@/features/register/utils/registrationDuration'
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
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader className={stepTitle ? '' : 'sr-only'}>
          <DialogTitle className="text-xl">{stepTitle}</DialogTitle>
        </DialogHeader>
        {match(step)
          .with('disclaimer', () => (
            <ExtendNameDisclaimer onContinue={() => setStep('settings')} />
          ))
          .with('settings', () => (
            <MultiNameExtendSettings
              selectedNames={selectedNames}
              duration={duration}
              setDuration={setDuration}
              onNext={() => setStep('summary')}
            />
          ))
          .with('summary', () => (
            <MultiNameExtendSummary
              selectedNames={selectedNames}
              duration={duration}
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
