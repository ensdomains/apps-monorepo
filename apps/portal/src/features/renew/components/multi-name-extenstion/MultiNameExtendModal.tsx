import { useState } from 'react'
import { match } from 'ts-pattern'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getDurationInSecondsFromYears } from '@/features/register/utils/registrationDuration'
import type { TokenWithPriceAndBalance } from '@/features/register/utils/tokenData'
import { useMultiNamePricing } from '../../hooks/useMultiNamePricing'
import type { SelectedName } from '../../hooks/useRenewalTransactions'
import { ExtendNameDisclaimer } from '../ExtendNameDisclaimer'
import { MultiNameExtendSettings } from './MultiNameExtendSettings'
import { MultiNameExtendSummary } from './MultiNameExtendSummary'
import { MultiNameExtensionSuccess } from './MultiNameExtensionSuccess'

type MultiRenewConfig = {
  readonly duration: number
  readonly token: TokenWithPriceAndBalance
}

type MultiNameExtendModalProps = {
  readonly open: boolean
  readonly onClose: () => void
  readonly selectedNames: SelectedName[]
  readonly onExtend: (config: MultiRenewConfig) => void
}

export type MultiNameExtendModalStep =
  | 'disclaimer'
  | 'settings'
  | 'summary'
  | 'success'

export const MultiNameExtendModal = ({
  open,
  onClose,
  selectedNames,
  onExtend,
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
              duration={duration}
              onBack={() => setStep('settings')}
              onNext={(token) => {
                onExtend({ duration, token })
                setStep('success')
              }}
            />
          ))
          .with('success', () => (
            <MultiNameExtensionSuccess pricingData={pricingData} />
          ))
          .exhaustive()}
      </DialogContent>
    </Dialog>
  )
}
