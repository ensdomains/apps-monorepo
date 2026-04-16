import { useState } from 'react'
import { match } from 'ts-pattern'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { TokenWithPriceAndBalance } from '@/features/register/utils/tokenData'
import {
  getLatestRenewalExpiry,
  useMultiNamePricing,
} from '../../hooks/useMultiNamePricing'
import type {
  MultiRenewalEntry,
  SelectedName,
} from '../../hooks/useRenewalTransactions'
import { ExtendNameDisclaimer } from '../ExtendNameDisclaimer'
import type { ExtensionSpanType } from '../ExtensionDurationOrExpiryPicker'
import { MultiNameExtendSettings } from './MultiNameExtendSettings'
import { MultiNameExtendSummary } from './MultiNameExtendSummary'
import { MultiNameExtensionSuccess } from './MultiNameExtensionSuccess'

type MultiRenewConfig = {
  readonly renewals: MultiRenewalEntry[]
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
  const [spanType, setSpanType] = useState<ExtensionSpanType>('years')
  const [duration, setDuration] = useState<number>(1)
  const latestExpiry = getLatestRenewalExpiry(selectedNames)

  const { pricingData, total, totalDiscount, allLoaded } = useMultiNamePricing(
    selectedNames,
    spanType,
    duration,
  )
  const renewals: MultiRenewalEntry[] = pricingData.map((item) => ({
    selectedName: item.selectedName,
    duration: item.duration,
  }))

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
              latestExpiry={latestExpiry}
              duration={duration}
              setDuration={setDuration}
              spanType={spanType}
              setSpanType={setSpanType}
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
              renewals={renewals}
              onBack={() => setStep('settings')}
              onNext={(token) => {
                onExtend({ renewals, token })
                setStep('success')
              }}
            />
          ))
          .with('success', () => (
            <MultiNameExtensionSuccess
              pricingData={pricingData}
              onClose={onClose}
            />
          ))
          .exhaustive()}
      </DialogContent>
    </Dialog>
  )
}
