import { CheckCircle2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
  readonly transactionCompleted: boolean
  readonly onSuccessAcknowledged: () => void
}

type ExtendNameModalStep = 'disclaimer' | 'settings' | 'confirm' | 'success'

export const ExtendNameModal = ({
  open,
  onClose,
  selectedName,
  onExtend,
  transactionCompleted,
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

  // Only transition to the success step when `transactionCompleted` flips from
  // false → true while the modal is open. Without the ref guard, this effect
  // would also fire when the modal remounts with a stale `transactionCompleted`
  // prop (e.g. after the parent clears row selection on completion, unmounting
  // the modal, and the user then selects another name to extend, remounting it
  // before the parent has had a chance to clear the success flag).
  const prevTransactionCompletedRef = useRef(transactionCompleted)
  useEffect(() => {
    if (open && transactionCompleted && !prevTransactionCompletedRef.current) {
      setStep('success')
    }
    prevTransactionCompletedRef.current = transactionCompleted
  }, [open, transactionCompleted])

  const resetInternalState = () => {
    setStep('disclaimer')
    setSpanType('years')
    setDuration(1)
  }

  const stepTitle = match(step)
    .with('disclaimer', () => undefined)
    .with('settings', () => 'Extend name')
    .with('confirm', () => 'Confirm extension')
    .with('success', () => undefined)
    .exhaustive()

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          resetInternalState()
          onClose()
        }
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
          .with('success', () => (
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-2">
                <CheckCircle2 className="size-10" />
                <h2 className="text-3xl font-medium">Extension complete</h2>
              </div>
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="w-full flex items-center gap-3 px-4 py-3">
                  <NameAvatar
                    name={selectedName.name}
                    height="40px"
                    width="40px"
                    rounded="rounded-md"
                  />
                  <span className="flex-1 text-left text-base font-medium text-foreground truncate">
                    {selectedName.name}
                  </span>
                </div>
              </div>
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => {
                  resetInternalState()
                  onSuccessAcknowledged()
                }}
              >
                Done
              </Button>
            </div>
          ))
          .exhaustive()}
      </DialogContent>
    </Dialog>
  )
}
