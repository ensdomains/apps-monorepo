import { CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { dateToPlainDate } from '@/utils/temporal'
import { useNamePricing } from '../hooks/useNamePricing'
import type {
  SelectedName,
  StartFlowConfig,
} from '../hooks/useRenewalTransactions'
import { ExtendNameConfirmation } from './ExtendNameConfirmation'
import { ExtendNameDisclaimer } from './ExtendNameDisclaimer'
import { ExtendNameSettings } from './ExtendNameSettings'
import type { ExtensionSpanType } from './ExtensionDurationOrExpiryPicker'

type ExtendNameModalProps = {
  readonly open: boolean
  readonly onClose: () => void
  readonly selectedName: SelectedName
  readonly onExtend: (config: StartFlowConfig) => void
  readonly transactionCompleted?: boolean
  readonly onSuccessAcknowledged?: () => void
}

type ExtendNameModalStep = 'disclaimer' | 'settings' | 'confirm'

export const ExtendNameModal = ({
  open,
  onClose,
  selectedName,
  onExtend,
  transactionCompleted = false,
  onSuccessAcknowledged,
}: ExtendNameModalProps) => {
  const [step, setStep] = useState<ExtendNameModalStep>('disclaimer')
  const [spanType, setSpanType] = useState<ExtensionSpanType>('years')
  const [duration, setDuration] = useState<number>(1)
  const baseDate = selectedName.expiryDate
    ? dateToPlainDate(selectedName.expiryDate)
    : undefined
  const { durationSeconds, price } = useNamePricing(
    selectedName,
    duration,
    spanType,
    baseDate,
    open,
  )

  useEffect(() => {
    if (!open) {
      setStep('disclaimer')
    }
  }, [open])

  const stepTitle = transactionCompleted
    ? 'Extension complete'
    : match(step)
        .with('disclaimer', () => undefined)
        .with('settings', () => 'Extend name')
        .with('confirm', () => 'Confirm extension')
        .exhaustive()

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader className={stepTitle ? '' : 'sr-only'}>
          <DialogTitle className="text-xl">{stepTitle}</DialogTitle>
        </DialogHeader>
        {transactionCompleted ? (
          <div className="mt-2 space-y-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <NameAvatar name={selectedName.name} height="60px" width="60px" />
              <div className="flex flex-col items-center gap-2">
                <CheckCircle2 className="size-8 text-peridot-600" aria-hidden />
                <p className="text-muted-foreground text-sm">
                  <span className="font-medium text-foreground">
                    {selectedName.name}
                  </span>{' '}
                  has been extended.
                </p>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => (onSuccessAcknowledged ?? onClose)()}
            >
              Done
            </Button>
          </div>
        ) : (
          match(step)
            .with('disclaimer', () => (
              <ExtendNameDisclaimer onContinue={() => setStep('settings')} />
            ))
            .with('settings', () => (
              <ExtendNameSettings
                selectedName={selectedName}
                duration={duration}
                setDuration={setDuration}
                spanType={spanType}
                setSpanType={setSpanType}
                baseDate={baseDate}
                onBack={() => setStep('disclaimer')}
                onNext={() => setStep('confirm')}
              />
            ))
            .with('confirm', () =>
              price ? (
                <ExtendNameConfirmation
                  selectedName={selectedName}
                  durationSeconds={durationSeconds}
                  price={price}
                  onBack={() => setStep('settings')}
                  onConfirm={(token) =>
                    onExtend({
                      duration: durationSeconds,
                      tokenAddress: token.address,
                      tokenPrice: token.price.total,
                      tokenAllowance: token.allowance,
                    })
                  }
                  isRegistering={false}
                />
              ) : null,
            )
            .exhaustive()
        )}
      </DialogContent>
    </Dialog>
  )
}
