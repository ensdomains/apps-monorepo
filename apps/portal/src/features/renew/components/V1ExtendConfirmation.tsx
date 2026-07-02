import { ArrowLeft } from 'lucide-react'
import { formatEther } from 'viem'
import { Button } from '@/components/ui/button'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { getRegistrationDisplayDates } from '@/features/register/utils/registrationDuration'
import { dateToPlainDate } from '@/utils/temporal'
import { formatWeiAsUsd, useEthUsdPrice } from '../hooks/useEthUsdPrice'
import type { V1RenewalPrice } from '../hooks/useV1RenewalPrice'

const formatEth = (wei: bigint): string =>
  `${Number(formatEther(wei)).toLocaleString('en-US', {
    maximumFractionDigits: 5,
  })} ETH`

type V1ExtendConfirmationProps = {
  readonly name: string
  readonly expiryDate: Date | undefined
  readonly durationSeconds: number
  readonly price: V1RenewalPrice
  readonly onBack: () => void
  readonly onConfirm: () => void
}

/**
 * Confirmation step for the legacy (ENSv1) ETH renewal. Unlike the ENSv2 flow
 * there is no payment-token picker or allowance — renewal is a single ETH
 * transaction — so this shows the ETH total and confirms directly.
 */
export const V1ExtendConfirmation = ({
  name,
  expiryDate,
  durationSeconds,
  price,
  onBack,
  onConfirm,
}: V1ExtendConfirmationProps) => {
  const { registrationPeriod, expiresFormatted } = getRegistrationDisplayDates(
    durationSeconds,
    expiryDate ? dateToPlainDate(expiryDate) : undefined,
  )

  const { data: ethUsdPrice } = useEthUsdPrice()
  const totalUsd = formatWeiAsUsd(price.total, ethUsdPrice)

  return (
    <div className="space-y-6 mt-2">
      <div className="flex items-center gap-2">
        <NameAvatar name={name} height="60px" width="60px" />
        <h2 className="text-3xl font-medium w-max text-foreground">{name}</h2>
      </div>

      <dl className="border border-border rounded-sm py-5 space-y-2">
        <div className="flex items-center justify-between px-5">
          <dt className="text-base text-foreground">Extension:</dt>
          <dd className="m-0 text-foreground">{registrationPeriod}</dd>
        </div>
        <div className="flex items-center justify-between px-5">
          <dt className="text-base text-foreground">New expiry:</dt>
          <dd className="m-0 text-foreground">{expiresFormatted}</dd>
        </div>
        <hr className="border-border my-3" />
        <div className="flex items-center justify-between px-5">
          <dt className="text-base text-foreground">Price:</dt>
          <dd className="m-0 text-foreground">{formatEth(price.base)}</dd>
        </div>
        {price.premium > 0n ? (
          <div className="flex items-center justify-between px-5">
            <dt className="text-base text-foreground">Premium:</dt>
            <dd className="m-0 text-foreground">{formatEth(price.premium)}</dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between px-5 pt-3 border-t border-border">
          <dt className="text-xl text-primary font-medium">Total:</dt>
          <dd className="m-0 flex flex-col items-end text-primary font-medium text-xl">
            <span>{formatEth(price.total)}</span>
            {totalUsd ? (
              <span className="text-xs font-normal text-muted-foreground">
                ≈ {totalUsd}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="flex gap-2">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <Button className="flex-1" variant="default" onClick={onConfirm}>
          Confirm
        </Button>
      </div>
    </div>
  )
}
