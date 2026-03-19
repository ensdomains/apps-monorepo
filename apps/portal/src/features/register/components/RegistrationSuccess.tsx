import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import { formatDiscountPercentForDisplay } from '@/features/register/utils/registrationDiscount'
import { getRegistrationDisplayDates } from '@/features/register/utils/registrationDuration'
import { formatPriceDisplay } from '@/features/register/utils/registrationPrice'
import { getPricingBreakdown } from '@/features/register/utils/registrationPricing'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'

type RegistrationSuccessProps = {
  readonly domainName: string
  readonly durationSeconds: number
  readonly price: RegistrationPriceResult
}

export const RegistrationSuccess = ({
  domainName,
  durationSeconds,
  price,
}: RegistrationSuccessProps) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isViewProfileLoading, setIsViewProfileLoading] = useState(false)

  const handleViewProfile = async () => {
    try {
      setIsViewProfileLoading(true)
      await pollForIndexerSync({
        invalidateQueries: async () => {
          await queryClient.invalidateQueries({
            queryKey: getEnsOwnerQueryOptions({ name: domainName }).queryKey,
            refetchType: 'all',
          })
          await queryClient.invalidateQueries({
            queryKey: getNameAvailabilityQueryOptions({ name: domainName })
              .queryKey,
            refetchType: 'all',
          })
          await queryClient.invalidateQueries({
            queryKey: getProfileQueryOptions({ name: domainName }).queryKey,
            refetchType: 'all',
          })
          navigate({
            to: '/$name',
            params: { name: domainName },
            replace: true,
          })
        },
      })
    } catch {
      // pass
    } finally {
      setIsViewProfileLoading(false)
    }
  }

  const { registrationPeriod, registrationDays, expiresFormatted } =
    getRegistrationDisplayDates(durationSeconds)

  const totalCost = formatPriceDisplay(price.total, price.decimals)

  const { discountAmount, discountPercent, discountLabel } =
    getPricingBreakdown(domainName, price, durationSeconds)

  const discountText =
    discountPercent > 0 && discountAmount > 0 && discountLabel
      ? `${discountLabel} discount (${formatDiscountPercentForDisplay(discountPercent)}): -${formatUsd(discountAmount)}`
      : undefined

  const handleRegisterAnother = () => {
    navigate({ to: '/register' })
    window.dispatchEvent(new CustomEvent('open-search-modal'))
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2">
        <CheckCircle2 className="size-8" />
        <h3 className="text-3xl font-medium" title={domainName}>
          Congratulations!
        </h3>
        <p className="text-base text-muted-foreground">
          You're now the owner of <b>{domainName}</b>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-sm">Registration</p>
          <p className="text-foreground text-base font-medium mt-1">
            {registrationPeriod}
          </p>
          <p className="text-muted-foreground text-xs mt-0.5">
            {registrationDays} days
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-sm">Expires</p>
          <p className="text-foreground text-base font-medium mt-1">
            {expiresFormatted}
          </p>
          <p className="text-muted-foreground text-xs mt-0.5">
            in {registrationDays} days
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-sm">Total cost</p>
          <p className="text-foreground text-base font-medium mt-1">
            {totalCost}
          </p>
          {discountText ? (
            <p className="text-success text-xs mt-0.5">{discountText}</p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Button variant="ghost" onClick={handleRegisterAnother}>
          Register another
        </Button>
        <Button
          variant="secondary"
          onClick={handleViewProfile}
          disabled={isViewProfileLoading}
        >
          {isViewProfileLoading ? 'Loading...' : 'View name'}
        </Button>
      </div>
    </section>
  )
}
