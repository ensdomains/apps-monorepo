import { useQuery } from '@tanstack/react-query'
import { SirenIcon } from 'lucide-react'
import { Fragment, type ReactNode, useState } from 'react'
import { ExternalLink } from 'react-external-link'
import { match } from 'ts-pattern'
import { useConnection } from 'wagmi'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TemporaryPremiumDrawer } from '@/features/register/components/TemporaryPremiumDrawer'
import {
  getRegistrationPriceQueryOptions,
  type RegistrationPriceResult,
} from '@/features/register/hooks/useRegistrationPrice'
import { getPremiumDatesFromRegistrationPrice } from '@/features/register/utils/premiumDecay'
import { formatDiscountPercentForDisplay } from '@/features/register/utils/registrationDiscount'
import { getRegistrationDisplayDates } from '@/features/register/utils/registrationDuration'
import {
  formatPriceDisplay,
  formatRegistrationTotal,
  isPriceResult,
} from '@/features/register/utils/registrationPrice'
import { getPricingBreakdown } from '@/features/register/utils/registrationPricing'
import { TransactionErrorAlert } from '@/features/registry/components/TransactionErrorAlert'
import { getTransactionErrorInfo } from '@/features/registry/utils/transactionErrorMessage'
import { cn } from '@/lib/utils'
import { formatExpiryDateTimeLocal } from '@/utils/formatting/formatDateTime'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { validateNameLength } from '@/utils/token/nameValidation'

type RegisterNameCheckoutSummaryProps = {
  readonly name: string
  readonly duration: number
}

/** ENS docs explaining premium pricing for short names */
const ENS_PREMIUM_PRICING_DOCS_URL =
  'https://docs.ens.domains/registry/eth/#3-4-and-5-letter-names'

export const RegisterNameCheckoutSummary = ({
  name,
  duration,
}: RegisterNameCheckoutSummaryProps) => {
  const [premiumDrawerOpen, setPremiumDrawerOpen] = useState(false)
  const isNameValid = !validateNameLength(name)
  const { address } = useConnection()

  const {
    data: price,
    isLoading,
    isError,
    error,
  } = useQuery({
    ...getRegistrationPriceQueryOptions({
      name,
      duration,
      owner: address,
    }),
    enabled: Boolean(name) && duration > 0 && isNameValid,
  })

  const hasPrice = price && isPriceResult(price)
  const premiumDates =
    hasPrice && price ? getPremiumDatesFromRegistrationPrice(price) : null

  return (
    <Fragment>
      {premiumDates && (
        <Alert variant="default" className="flex p-5 items-center">
          <SirenIcon className="h-12 w-12 shrink-0" />
          <AlertDescription className="text-base">
            This name is in Temporary premium until{' '}
            {formatExpiryDateTimeLocal(premiumDates.premiumEndDate)}.
          </AlertDescription>
          <Button
            variant="outline"
            size="sm"
            className="text-primary text-sm"
            onClick={() => setPremiumDrawerOpen(true)}
          >
            Learn more
          </Button>
        </Alert>
      )}
      <section
        className="border border-border rounded-lg bg-card p-5"
        aria-label="Checkout summary"
      >
        {match({ isLoading, isError, hasPrice })
          .with({ isLoading: true }, () => <PriceBreakdownSkeleton />)
          .with({ isError: true }, () => {
            const errorInfo = error ? getTransactionErrorInfo(error) : null
            return (
              <TransactionErrorAlert
                title="Failed to load price"
                summary={
                  errorInfo?.summary ??
                  'Failed to load price. Please try again.'
                }
                details={errorInfo?.details}
              />
            )
          })
          .with({ hasPrice: true }, () =>
            price ? (
              <PriceBreakdown name={name} price={price} duration={duration} />
            ) : null,
          )
          .otherwise(() => (
            <div className="border border-border rounded-md p-4">
              <p className="text-muted-foreground text-sm">
                Unable to load price
              </p>
            </div>
          ))}

        {hasPrice && price.hasPremium && (
          <TemporaryPremiumDrawer
            open={premiumDrawerOpen}
            onOpenChange={setPremiumDrawerOpen}
            currentPremium={formatPriceDisplay(price.premium, price.decimals)}
            premiumStartDate={premiumDates?.premiumStartDate ?? null}
          />
        )}
      </section>
    </Fragment>
  )
}

type SummaryRowProps = {
  readonly label: ReactNode
  readonly value: ReactNode
  readonly className?: string
  readonly labelClassName?: string
  readonly valueClassName?: string
}

const SummaryRow = ({
  label,
  value,
  className,
  labelClassName,
  valueClassName,
}: SummaryRowProps) => (
  <div className={cn('flex items-center justify-between', className)}>
    <dt className={cn('text-base font-normal text-quartz-350', labelClassName)}>
      {label}
    </dt>
    <dd className={cn('m-0 font-normal text-quartz-900', valueClassName)}>
      {value}
    </dd>
  </div>
)

const PriceBreakdownSkeleton = () => (
  <div className="space-y-2">
    <dl className="space-y-2">
      <SummaryRow
        label="Registration:"
        value={<Skeleton className="h-5 w-16" />}
      />
      <SummaryRow label="Expires:" value={<Skeleton className="h-5 w-24" />} />

      <hr className="border-border" />

      <SummaryRow label="Price:" value={<Skeleton className="h-5 w-20" />} />
      <SummaryRow
        label="Subtotal:"
        value={
          <span className="flex items-center gap-1">
            <Skeleton className="h-5 w-14" />
          </span>
        }
        valueClassName="flex items-center gap-1 m-0"
      />

      <SummaryRow
        label="Total:"
        value={
          <span className="flex items-center gap-1">
            <Skeleton className="h-7 w-14" />
          </span>
        }
        className="pt-3 border-t border-border"
        labelClassName="text-xl text-primary font-medium"
        valueClassName="flex items-center gap-1 m-0 text-primary font-medium text-xl"
      />
    </dl>
  </div>
)

type PriceBreakdownProps = {
  readonly name: string
  readonly price: RegistrationPriceResult
  readonly duration: number
}

const PriceBreakdown = ({ name, price, duration }: PriceBreakdownProps) => {
  const { registrationPeriod, expiresFormatted } =
    getRegistrationDisplayDates(duration)

  const {
    pricePerYear,
    years,
    standardSubtotal,
    discountAmount,
    discountPercent,
    discountLabel,
    premiumLabel,
  } = getPricingBreakdown(name, price, duration)

  return (
    <div className="space-y-2">
      <dl className="space-y-2">
        <SummaryRow label="Registration:" value={registrationPeriod} />
        <SummaryRow label="Expires:" value={expiresFormatted} />

        <hr className="border-border my-3" />

        {price.hasPremium && (
          <SummaryRow
            label={'Temporary premium:'}
            value={formatPriceDisplay(price.premium, price.decimals)}
            labelClassName="font-medium text-quartz-900"
            valueClassName="font-medium text-quartz-900"
          />
        )}

        <SummaryRow
          label={
            premiumLabel ? (
              <ExternalLink
                href={ENS_PREMIUM_PRICING_DOCS_URL}
                className="underline decoration-dotted underline-offset-2"
              >
                {premiumLabel.label}:
              </ExternalLink>
            ) : (
              'Price:'
            )
          }
          value={`${formatUsd(pricePerYear)}/year × ${Math.round(years)}`}
        />

        <SummaryRow
          label="Subtotal:"
          value={formatUsd(standardSubtotal)}
          valueClassName="flex items-center gap-1 m-0"
        />

        {discountPercent > 0 && discountAmount > 0 && discountLabel && (
          <SummaryRow
            label={`${discountLabel} discount (${formatDiscountPercentForDisplay(discountPercent)}):`}
            value={`-${formatUsd(discountAmount)}`}
            valueClassName="flex items-center gap-1 m-0 text-success"
            labelClassName="text-success"
          />
        )}

        <SummaryRow
          label="Total:"
          value={formatRegistrationTotal(
            price.base,
            price.premium,
            price.decimals,
          )}
          className="pt-3 border-t border-border"
          labelClassName="text-xl text-primary font-medium"
          valueClassName="flex items-center gap-1 m-0 text-primary font-medium text-xl"
        />
      </dl>
    </div>
  )
}
