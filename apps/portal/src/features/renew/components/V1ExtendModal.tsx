import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import { formatEther, isAddressEqual } from 'viem'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { dateToPlainDate } from '@/utils/temporal'
import { formatWeiAsUsd, useEthUsdPrice } from '../hooks/useEthUsdPrice'
import { getRenewalDurationSeconds } from '../hooks/useMultiNamePricing'
import { getV1RenewalPriceQueryOptions } from '../hooks/useV1RenewalPrice'
import type { StartV1FlowConfig } from '../hooks/useV1RenewalTransactions'
import { ExtendNameDisclaimer } from './ExtendNameDisclaimer'
import {
  ExtensionDurationOrExpiryPicker,
  type ExtensionSpanType,
} from './ExtensionDurationOrExpiryPicker'
import { V1ExtendConfirmation } from './V1ExtendConfirmation'

/** 10% buffer over the quoted price to absorb per-block price drift. */
const withBuffer = (total: bigint): bigint => (total * 110n) / 100n

const formatEth = (wei: bigint): string =>
  `${Number(formatEther(wei)).toLocaleString('en-US', {
    maximumFractionDigits: 5,
  })} ETH`

type V1ExtendModalProps = {
  readonly open: boolean
  readonly onClose: () => void
  readonly name: string
  readonly expiryDate: Date | undefined
  readonly onExtend: (config: StartV1FlowConfig) => void
}

type V1ExtendModalStep = 'disclaimer' | 'settings' | 'confirm'

/**
 * Dedicated extend flow for legacy (ENSv1) .eth names: ETH-priced, single
 * transaction, no payment-token picker. Kept separate from the ENSv2
 * `ExtendNameModal` (which is ERC-20 / allowance based) so neither path carries
 * the other's special-cases. Duration keeps the length/date selector but omits
 * the per-year discount preset chips (no `name` passed to the picker).
 */
export const V1ExtendModal = ({
  open,
  onClose,
  name,
  expiryDate,
  onExtend,
}: V1ExtendModalProps) => {
  const [step, setStep] = useState<V1ExtendModalStep>('disclaimer')
  const [spanType, setSpanType] = useState<ExtensionSpanType>('years')
  const [duration, setDuration] = useState<number>(1)

  const baseDate = expiryDate ? dateToPlainDate(expiryDate) : undefined
  const durationSeconds = getRenewalDurationSeconds({
    spanType,
    duration,
    baseDate,
  })

  const { data: price } = useQuery({
    ...getV1RenewalPriceQueryOptions({ name, durationSeconds }),
    enabled: open && durationSeconds > 0,
  })

  const { data: ethUsdPrice } = useEthUsdPrice()
  const totalUsd = price ? formatWeiAsUsd(price.total, ethUsdPrice) : null

  const { address } = useAccount()
  const { data: ownerData } = useQuery(getEnsOwnerQueryOptions({ name }))
  const isOwner = !!(
    address &&
    ownerData?.owner &&
    isAddressEqual(address, ownerData.owner)
  )

  // Owners don't need the "extending doesn't change ownership" disclaimer.
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
      onOpenChange={(next) => {
        if (!next) {
          onClose()
          setStep(isOwner ? 'settings' : 'disclaimer')
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
            <div className="space-y-6 mt-2">
              <div className="flex items-center gap-2">
                <NameAvatar name={name} height="60px" width="60px" />
                <h2 className="text-3xl font-medium w-max text-foreground">
                  {name}
                </h2>
              </div>
              {/* No `name` prop → keeps the length/date selector, drops the
                  per-year discount preset chips. */}
              <ExtensionDurationOrExpiryPicker
                duration={duration}
                setDuration={setDuration}
                expiryDate={expiryDate ?? null}
                spanType={spanType}
                setSpanType={setSpanType}
              />
              <div className="flex items-center justify-between border border-border rounded-sm p-5">
                <span className="text-base text-foreground">Total</span>
                {price ? (
                  <span className="flex flex-col items-end">
                    <span className="text-foreground font-medium">
                      {formatEth(price.total)}
                    </span>
                    {totalUsd ? (
                      <span className="text-xs text-muted-foreground">
                        ≈ {totalUsd}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <Skeleton className="h-5 w-20" />
                )}
              </div>
              <div className="flex gap-2">
                {!isOwner ? (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setStep('disclaimer')}
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                ) : null}
                <Button
                  className="flex-1"
                  variant="default"
                  disabled={!price}
                  onClick={() => setStep('confirm')}
                >
                  Next
                </Button>
              </div>
            </div>
          ))
          .with('confirm', () =>
            price ? (
              <V1ExtendConfirmation
                name={name}
                expiryDate={expiryDate}
                durationSeconds={durationSeconds}
                price={price}
                onBack={() => setStep('settings')}
                onConfirm={() =>
                  onExtend({
                    durationSeconds,
                    value: withBuffer(price.total),
                  })
                }
              />
            ) : null,
          )
          .exhaustive()}
      </DialogContent>
    </Dialog>
  )
}
