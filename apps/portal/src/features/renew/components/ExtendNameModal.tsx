import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import { isAddressEqual } from 'viem'
import { useAccount } from 'wagmi'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { PriceErrorCard } from '@/features/register/components/PaymentTokenPicker'
import { dateToPlainDate } from '@/utils/temporal'
import { useNamePricing } from '../hooks/useNamePricing'
import type {
  SelectedName,
  StartFlowConfig,
} from '../hooks/useRenewalTransactions'
import type { ExtensionSpan } from '../utils/extensionDurationPicker'
import { ExtendNameConfirmation } from './ExtendNameConfirmation'
import { ExtendNameDisclaimer } from './ExtendNameDisclaimer'
import { ExtendNameSettings } from './ExtendNameSettings'

type ExtendNameModalProps = {
  readonly open: boolean
  readonly onClose: () => void
  readonly selectedName: SelectedName
  readonly onExtend: (config: StartFlowConfig) => void
}

type ExtendNameModalStep = 'disclaimer' | 'settings' | 'confirm'

export const ExtendNameModal = ({
  open,
  onClose,
  selectedName,
  onExtend,
}: ExtendNameModalProps) => {
  const [step, setStep] = useState<ExtendNameModalStep>('disclaimer')
  const [span, setSpan] = useState<ExtensionSpan>({ type: 'years', years: 1 })
  const baseDate = selectedName.expiryDate
    ? dateToPlainDate(selectedName.expiryDate)
    : undefined
  const { durationSeconds, price, isError, refetch } = useNamePricing(
    selectedName,
    span,
    baseDate,
    open,
  )
  // An errored refetch keeps the last good `data`, so check isError too: the
  // confirm step must never proceed on a price the latest read failed to back.
  const hasPrice = price !== null && !isError

  const { address } = useAccount()
  // Query runs eagerly (not gated on `open`) so ownership is known before
  // the modal opens — otherwise owners see the disclaimer flash for the
  // duration of the network round-trip before being skipped to settings.
  const { data: ownerData } = useQuery(
    getEnsOwnerQueryOptions({ name: selectedName.name }),
  )
  const isOwner = !!(
    address &&
    ownerData?.owner &&
    isAddressEqual(address, ownerData.owner)
  )

  // Skip the disclaimer when the connected wallet owns the name —
  // the warning ("Extending a name does not change the owner...") is noise for owners.
  useEffect(() => {
    if (open && isOwner) {
      setStep((current) => (current === 'disclaimer' ? 'settings' : current))
    }
  }, [open, isOwner])

  const stepTitle = match(step)
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
          setStep(isOwner ? 'settings' : 'disclaimer')
        }
      }}
    >
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader className={stepTitle ? '' : 'sr-only'}>
          <DialogTitle>{stepTitle}</DialogTitle>
        </DialogHeader>
        {match(step)
          .with('disclaimer', () => (
            <ExtendNameDisclaimer onContinue={() => setStep('settings')} />
          ))
          .with('settings', () => (
            <ExtendNameSettings
              selectedName={selectedName}
              span={span}
              setSpan={setSpan}
              baseDate={baseDate}
              onBack={isOwner ? undefined : () => setStep('disclaimer')}
              canContinue={hasPrice}
              onNext={() => setStep('confirm')}
            />
          ))
          .with('confirm', () =>
            hasPrice ? (
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
              />
            ) : (
              <PriceErrorCard mode="renew" onRetry={() => refetch()} />
            ),
          )
          .exhaustive()}
      </DialogContent>
    </Dialog>
  )
}
