import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { formatUnits } from 'viem'
import { Button } from '@/components/ui/button'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { useBaseRate } from '@/features/register/hooks/useBaseRate'
import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import { getRegistrationDisplayDates } from '@/features/register/utils/registrationDuration'
import { formatPriceDisplay } from '@/features/register/utils/registrationPrice'
import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'

type RegistrationSuccessProps = {
  readonly domainName: string
  readonly durationSeconds: number
  readonly price: RegistrationPriceResult
  readonly onRegisterAnother: () => void
}

export const RegistrationSuccess = ({
  domainName,
  durationSeconds,
  price,
  onRegisterAnother,
}: RegistrationSuccessProps) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isViewProfileLoading, setIsViewProfileLoading] = useState(false)

  const baseRate = useBaseRate(domainName)

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
    } catch (error) {
      console.error('Failed to sync profile after registration:', error)
    } finally {
      setIsViewProfileLoading(false)
    }
  }

  const { registrationPeriod, registrationDays, expiresFormatted } =
    getRegistrationDisplayDates(durationSeconds)

  const totalCost = formatPriceDisplay(price.total, price.decimals)

  // Discount = diff between undiscounted (baseRate × duration) and actual price
  const basePriceNumber = Number(formatUnits(price.base, price.decimals))
  const basePriceWithoutDiscount =
    baseRate > 0n
      ? Number(formatUnits(baseRate * BigInt(Math.round(durationSeconds)), 12))
      : 0
  const discountAmount = Math.max(basePriceWithoutDiscount - basePriceNumber, 0)
  const discountPercentage =
    basePriceWithoutDiscount > 0
      ? Math.round((discountAmount / basePriceWithoutDiscount) * 100)
      : 0
  const years = durationSeconds / CONTRACT_SECONDS_PER_YEAR
  const discountText =
    discountAmount > 0 && discountPercentage > 0 && years >= 2
      ? `${Math.floor(years)}+ years discount (${discountPercentage}%): -${formatUsd(discountAmount)}`
      : undefined

  const handleRegisterAnother = () => {
    onRegisterAnother()
    navigate({ to: '/register' })
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
