import { useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getLatestRenewalExpiry,
  useMultiNamePricing,
} from '../../hooks/useMultiNamePricing'
import type {
  MultiRenewalEntry,
  SelectedName,
} from '../../hooks/useRenewalTransactions'
import type { ExtensionSpan } from '../../utils/extensionDurationPicker'
import { ExtendNameDisclaimer } from '../ExtendNameDisclaimer'
import { MultiNameExtendSettings } from './MultiNameExtendSettings'
import { MultiNameExtendSummary } from './MultiNameExtendSummary'
import type { MultiNameTokenSelection } from './MultiNamePaymentTokenPicker'

type MultiRenewConfig = {
  readonly renewals: readonly MultiRenewalEntry[]
  readonly selection: MultiNameTokenSelection
}

type MultiNameExtendModalProps = {
  readonly open: boolean
  readonly onClose: () => void
  readonly selectedNames: readonly SelectedName[]
  readonly onExtend: (config: MultiRenewConfig) => void
}

export type MultiNameExtendModalStep = 'disclaimer' | 'settings' | 'summary'

export const MultiNameExtendModal = ({
  open,
  onClose,
  selectedNames,
  onExtend,
}: MultiNameExtendModalProps) => {
  const [step, setStep] = useState<MultiNameExtendModalStep>('disclaimer')
  const [span, setSpan] = useState<ExtensionSpan>({ type: 'years', years: 1 })
  const latestExpiry = getLatestRenewalExpiry(selectedNames)

  const { pricingData, total, totalDiscount, allLoaded } = useMultiNamePricing(
    selectedNames,
    span,
  )
  const renewals: readonly MultiRenewalEntry[] = pricingData.map((item) => ({
    selectedName: item.selectedName,
    duration: item.duration,
  }))

  useEffect(() => {
    if (!open) {
      setStep('disclaimer')
    }
  }, [open])

  const stepTitle = match(step)
    .with('disclaimer', () => undefined)
    .with('settings', () => 'Extend names')
    .with('summary', () => 'Confirm extension')
    .exhaustive()

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose()
        }
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
              span={span}
              setSpan={setSpan}
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
              onNext={(selection) => {
                onExtend({ renewals, selection })
              }}
            />
          ))
          .exhaustive()}
      </DialogContent>
    </Dialog>
  )
}
