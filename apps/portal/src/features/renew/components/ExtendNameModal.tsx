import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { match } from 'ts-pattern'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getRegistrationPriceQueryOptions } from '@/features/register/hooks/useRegistrationPrice'
import { getDurationInSecondsFromYears } from '@/features/register/utils/registrationDuration'
import { isPriceResult } from '@/features/register/utils/registrationPrice'
import type {
  SelectedName,
  StartFlowConfig,
} from '../hooks/useRenewalTransactions'
import { ExtendNameConfirmation } from './ExtendNameConfirmation'
import { ExtendNameDisclaimer } from './ExtendNameDisclaimer'
import { ExtendNameSettings } from './ExtendNameSettings'

type ExtendNameModalProps = {
  readonly open: boolean
  readonly onClose: () => void
  readonly selectedName: SelectedName
  readonly onExtend: (config: StartFlowConfig) => void
}

type ExtendNameModalStep = 'disclaimer' | 'settings' | 'confirm' | 'success'

export const ExtendNameModal = ({
  open,
  onClose,
  selectedName,
  onExtend,
}: ExtendNameModalProps) => {
  const [step, setStep] = useState<ExtendNameModalStep>('disclaimer')
  const [duration, setDuration] = useState<number>(() =>
    getDurationInSecondsFromYears(1),
  )

  const { data: priceData } = useQuery({
    ...getRegistrationPriceQueryOptions({ name: selectedName.name, duration }),
    enabled: open && duration > 0,
  })

  const price = priceData && isPriceResult(priceData) ? priceData : undefined

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
            <ExtendNameSettings
              selectedName={selectedName}
              duration={duration}
              setDuration={setDuration}
              onNext={() => setStep('confirm')}
            />
          ))
          .with('confirm', () =>
            price ? (
              <ExtendNameConfirmation
                selectedName={selectedName}
                durationSeconds={duration}
                price={price}
                onConfirm={(token) =>
                  onExtend({
                    duration,
                    v2TokenAddress: token.address,
                    v2TokenPrice: token.price.total,
                  })
                }
                isRegistering={false}
              />
            ) : null,
          )
          .with('success', () => null)
          .exhaustive()}
      </DialogContent>
    </Dialog>
  )
}
