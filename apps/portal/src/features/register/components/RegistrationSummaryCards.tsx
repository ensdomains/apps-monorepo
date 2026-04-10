import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import { formatDiscountPercentForDisplay } from '@/features/register/utils/registrationDiscount'
import { getRegistrationDisplayDates } from '@/features/register/utils/registrationDuration'
import { formatPriceDisplay } from '@/features/register/utils/registrationPrice'
import { getPricingBreakdown } from '@/features/register/utils/registrationPricing'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'

type RegistrationSummaryCardsProps = {
  readonly domainName: string
  readonly durationSeconds: number
  readonly price: RegistrationPriceResult
}

export const RegistrationSummaryCards = ({
  domainName,
  durationSeconds,
  price,
}: RegistrationSummaryCardsProps) => {
  const { registrationPeriod, registrationDays, expiresFormatted } =
    getRegistrationDisplayDates(durationSeconds)

  const totalCost = formatPriceDisplay(price.total, price.decimals)

  const { discountAmount, discountPercent, discountLabel } =
    getPricingBreakdown(domainName, price, durationSeconds)

  const discountText =
    discountPercent > 0 && discountAmount > 0 && discountLabel
      ? `${discountLabel} discount (${formatDiscountPercentForDisplay(discountPercent)}): -${formatUsd(discountAmount)}`
      : undefined

  return (
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
  )
}
