import { Trans } from '@lingui/react/macro'
import { AnimateNumber } from 'motion-plus/react'
import { MSymbol } from '@/components/ui/material-symbol'
import { tw } from '@/utils/tailwind'

export const PaymentCardPremiumLine = ({
  premiumAmount,
  isLoading,
}: {
  premiumAmount: number
  isLoading: boolean
}) => (
  <div
    className={tw(
      'flex w-full items-center justify-between text-base text-ens-lapis-500',
      isLoading && 'animate-pulse',
    )}
  >
    <div className="flex items-center gap-2">
      <MSymbol className="ms-opsz-16 ms-wght-400" symbol="hourglass" />
      <span>
        <Trans>Price cooldown fee</Trans>
      </span>
    </div>
    <span>
      +{' '}
      <AnimateNumber
        format={{
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }}
      >
        {premiumAmount}
      </AnimateNumber>
    </span>
  </div>
)
