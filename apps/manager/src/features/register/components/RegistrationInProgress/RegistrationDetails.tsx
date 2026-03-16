'use client'

import { Plural, Trans } from '@lingui/react/macro'
import { DomainCard } from '@/components/atoms/DomainCard'
import { Button } from '@/components/ui/button'
import { formatYears } from '@/features/register/components/Pricing/utils'
import { cn } from '@/lib/utils'

interface RegistrationDetailsProps {
  domainName: string
  duration: number
  totalPrice: number
  discountAmount: number
  expiresDate: Date
  className?: string
  onGoToDashboard?: () => void
  onProfileNavigate?: () => void
  isRegistrationComplete?: boolean
}

export const RegistrationDetails = ({
  domainName,
  duration,
  totalPrice,
  discountAmount,
  expiresDate,
  className,
  onProfileNavigate,
  isRegistrationComplete = false,
}: RegistrationDetailsProps) => {
  const formattedDurationYears = formatYears(duration)
  const formattedExpiresDate = expiresDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // Calculate the registration fee (total + discount = original fee)
  const registrationFee = totalPrice + discountAmount
  const formattedRegistrationFee = registrationFee.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const formattedTotalPrice = totalPrice.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const formattedDiscount = discountAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const discountPercentage =
    registrationFee > 0
      ? Math.round((discountAmount / registrationFee) * 100)
      : 0

  return (
    <div className={cn('flex w-full flex-col gap-6', className)}>
      {/* Main Content - Two columns on desktop, stacked on mobile */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-16">
        {/* Domain Card */}
        <div className="w-full lg:w-1/2">
          <DomainCard domainName={domainName} variant="garnet" />
        </div>

        {/* Registration Details */}
        <div className="flex w-full flex-col gap-6 lg:w-1/2">
          <div className="flex flex-col gap-5">
            <h3 className="font-medium text-ens-blue-dark text-xl tracking-tight">
              <Trans>Registration Details</Trans>
            </h3>

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-base text-ens-gray">
                  <Trans>Registration Period</Trans>
                </p>
                <p className="text-base text-ens-blue-dark">
                  <Plural
                    one="# Year"
                    other="# Years"
                    value={Number(formattedDurationYears)}
                  />
                </p>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-base text-ens-gray">
                  <Trans>Registration Fee</Trans>
                </p>
                <p className="text-base text-ens-blue-dark">
                  ${formattedRegistrationFee}
                </p>
              </div>

              {discountAmount > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-base text-ens-peridot-core">
                    <Trans>Multi-year Discount ({discountPercentage}%)</Trans>
                  </p>
                  <p className="text-base text-ens-peridot-core">
                    -${formattedDiscount}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between border-ens-gray-two border-t pt-4">
                <p className="text-base text-ens-blue-dark">
                  <Trans>Total Paid</Trans>
                </p>
                <p className="text-base text-ens-blue-dark">
                  ${formattedTotalPrice}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-base text-ens-gray">
                  <Trans>Expires</Trans>
                </p>
                <p className="text-base text-ens-blue">
                  {formattedExpiresDate}
                </p>
              </div>
            </div>
          </div>

          <Button
            className="h-14 w-full rounded bg-ens-blue font-mono text-sm text-white uppercase tracking-wider transition-colors hover:bg-ens-blue-hover disabled:bg-ens-gray-two disabled:text-ens-gray"
            disabled={!isRegistrationComplete}
            onClick={onProfileNavigate}
          >
            <Trans>Create Profile</Trans>
          </Button>
        </div>
      </div>
    </div>
  )
}
