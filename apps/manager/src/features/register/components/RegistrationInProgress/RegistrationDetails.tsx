'use client'

import { DomainCard } from '@/components/atoms/DomainCard'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RegistrationDetailsProps {
  domainName: string
  duration: number
  totalPrice: number
  discountAmount: number
  expiresDate: Date
  className?: string
  onGoToDashboard?: () => void
  onCreateProfile?: () => void
  isRegistrationComplete?: boolean
}

export const RegistrationDetails = ({
  domainName,
  duration,
  totalPrice,
  discountAmount,
  expiresDate,
  className,
  onGoToDashboard,
  onCreateProfile,
  isRegistrationComplete = false,
}: RegistrationDetailsProps) => {
  const formattedExpiresDate = expiresDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const formattedTotalPrice = totalPrice.toLocaleString('en-US', {
    maximumFractionDigits: 0,
  })

  const formattedDiscount = discountAmount.toLocaleString('en-US', {
    maximumFractionDigits: 0,
  })

  const discountPercentage =
    totalPrice > 0
      ? Math.round((discountAmount / (totalPrice + discountAmount)) * 100)
      : 0

  return (
    <div
      className={cn('flex w-full flex-col gap-8 bg-gray-100 py-6', className)}
    >
      <div className="flex flex-col items-center gap-6">
        <DomainCard domainName={domainName} variant="garnet" />
      </div>

      <div className="flex flex-col gap-6 rounded-xl border border-ens-gray-two bg-white p-8 shadow-sm">
        <h3 className="font-medium text-ens-blue-dark text-xl tracking-tight">
          Registration Details
        </h3>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-base text-ens-gray">Registration Period</p>
            <p className="text-base text-ens-blue-dark">
              {duration} {duration === 1 ? 'Year' : 'Years'}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-base text-ens-gray">Registration Fee</p>
            <p className="text-base text-ens-blue-dark">
              ${formattedTotalPrice}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-base text-ens-peridot-core">
              Multi-year Discount ({discountPercentage}%)
            </p>
            <p className="text-base text-ens-peridot-core">
              -${formattedDiscount}
            </p>
          </div>

          <div className="h-px bg-black/10" />

          <div className="flex items-center justify-between">
            <p className="text-base text-ens-blue-dark">Total Paid</p>
            <p className="text-base text-ens-blue-dark">
              ${formattedTotalPrice}
            </p>
          </div>

          <div className="h-px bg-black/10" />

          <div className="flex items-center justify-between">
            <p className="text-base text-ens-gray">Expires</p>
            <p className="text-base text-ens-blue-dark">
              {formattedExpiresDate}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Button
          disabled={!isRegistrationComplete}
          onClick={onCreateProfile}
          className="h-20 w-full rounded bg-ens-blue font-mono text-sm text-white uppercase tracking-wider transition-colors hover:bg-ens-blue-hover disabled:bg-ens-gray-two disabled:text-ens-gray"
        >
          Create Profile
        </Button>
        <Button
          variant="outline"
          disabled={!isRegistrationComplete}
          onClick={onGoToDashboard}
          className="h-20 w-full rounded border-ens-blue bg-white font-mono text-sm uppercase tracking-wider transition-colors hover:bg-ens-blue-light disabled:border-ens-gray-two disabled:text-ens-gray disabled:hover:bg-white"
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  )
}
