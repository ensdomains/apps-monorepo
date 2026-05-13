import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import { getRegistrationDisplayDates } from '@/features/register/utils/registrationDuration'
import { formatPriceDisplay } from '@/features/register/utils/registrationPrice'
// import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'
import { dateToPlainDate } from '@/utils/temporal'

type RegistrationSummaryCardsProps = {
  readonly domainName: string
  readonly durationSeconds: number
  readonly price: RegistrationPriceResult
  /** Anchor date for expiry calc; defaults to today. Pass current expiry for extensions. */
  readonly baseDate?: Date
  readonly isExtension?: boolean
}

export const RegistrationSummaryCards = ({
  durationSeconds,
  price,
  baseDate,
  isExtension = false,
}: RegistrationSummaryCardsProps) => {
  const {
    registrationPeriod,
    registrationDays,
    daysUntilExpiry,
    expiresFormatted,
  } = getRegistrationDisplayDates(
    durationSeconds,
    baseDate ? dateToPlainDate(baseDate) : undefined,
  )

  // Renewal only charges `base` (ETHRegistrar.renew). Registration charges base + premium.
  const totalCost = formatPriceDisplay(
    isExtension ? price.base : price.total,
    price.decimals,
  )

  // const roundedYears = Math.round(durationSeconds / CONTRACT_SECONDS_PER_YEAR)
  // const discountText =
  //   roundedYears >= 2 ? `${roundedYears}+ yr discount price` : undefined

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-sm">{isExtension ? 'Extension' : 'Registration'}</p>
        <p className="text-foreground text-base font-medium mt-1">
          {registrationPeriod}
        </p>
        <p className="text-muted-foreground text-xs mt-0.5">
          {registrationDays} days
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-sm">{isExtension ? 'New expiry' : 'Expires'}</p>
        <p className="text-foreground text-base font-medium mt-1">
          {expiresFormatted}
        </p>
        <p className="text-muted-foreground text-xs mt-0.5">
          in {daysUntilExpiry} days
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-sm">Total cost</p>
        <p className="text-foreground text-base font-medium mt-1">
          {totalCost}
        </p>
        {/* {discountText ? (
          <p className="text-success-text text-xs mt-0.5">{discountText}</p>
        ) : null} */}
      </div>
    </div>
  )
}
