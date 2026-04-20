import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { match } from 'ts-pattern'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getRegistrationPriceQueryOptions,
  type RegistrationPriceResult,
} from '@/features/register/hooks/useRegistrationPrice'
import {
  getRegistrationDisplayDates,
  getStartOfToday,
} from '@/features/register/utils/registrationDuration'
import {
  formatPriceDisplay,
  formatRegistrationTotal,
  isPriceResult,
} from '@/features/register/utils/registrationPrice'
import { getPricingBreakdown } from '@/features/register/utils/registrationPricing'
import { TransactionErrorAlert } from '@/features/registry/components/TransactionErrorAlert'
import { getTransactionErrorInfo } from '@/features/registry/utils/transactionErrorMessage'
import { cn } from '@/lib/utils'
import { formatExpiryDate } from '@/utils/formatting/formatDateTime'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { dateToPlainDate } from '@/utils/temporal'
import type { SelectedName } from '../hooks/useRenewalTransactions'

type ExtendNameCheckoutSummaryProps = {
  readonly selectedName: SelectedName
  readonly duration: number
}

export const ExtendNameCheckoutSummary = ({
  selectedName,
  duration,
}: ExtendNameCheckoutSummaryProps) => {
  const {
    data: price,
    isLoading,
    isError,
    error,
  } = useQuery({
    ...getRegistrationPriceQueryOptions({
      name: selectedName.name,
      duration,
    }),
    enabled: duration > 0,
  })

  const hasPrice = price && isPriceResult(price)

  return (
    <section
      className="border border-border rounded-lg bg-card py-5"
      aria-label="Extension summary"
    >
      {match({ isLoading, isError, hasPrice })
        .with({ isLoading: true }, () => <ExtensionSkeleton />)
        .with({ isError: true }, () => {
          const errorInfo = error ? getTransactionErrorInfo(error) : null
          return (
            <TransactionErrorAlert
              title="Failed to load price"
              summary={
                errorInfo?.summary ?? 'Failed to load price. Please try again.'
              }
              details={errorInfo?.details}
            />
          )
        })
        .with({ hasPrice: true }, () =>
          price ? (
            <ExtensionPriceBreakdown
              selectedName={selectedName}
              price={price}
              duration={duration}
            />
          ) : null,
        )
        .otherwise(() => (
          <div className="border border-border rounded-md p-4">
            <p className="text-muted-foreground text-sm">
              Unable to load price
            </p>
          </div>
        ))}
    </section>
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
  <div className={cn('flex items-center justify-between px-5', className)}>
    <dt className={cn('text-base font-normal text-quartz-350', labelClassName)}>
      {label}
    </dt>
    <dd className={cn('m-0 font-normal text-quartz-900', valueClassName)}>
      {value}
    </dd>
  </div>
)

const ExtensionSkeleton = () => (
  <dl className="space-y-2">
    <SummaryRow label="Extension:" value={<Skeleton className="h-5 w-16" />} />
    <SummaryRow label="New expiry:" value={<Skeleton className="h-5 w-24" />} />
    <hr className="border-border" />
    <SummaryRow label="Price:" value={<Skeleton className="h-5 w-20" />} />
    <SummaryRow label="Subtotal:" value={<Skeleton className="h-5 w-20" />} />
    <SummaryRow
      label="Total:"
      value={<Skeleton className="h-7 w-14" />}
      className="pt-3 border-t border-border"
      labelClassName="text-xl text-primary font-medium"
    />
  </dl>
)

type ExtensionPriceBreakdownProps = {
  readonly selectedName: SelectedName
  readonly price: RegistrationPriceResult
  readonly duration: number
}

const ExtensionPriceBreakdown = ({
  selectedName,
  price,
  duration,
}: ExtensionPriceBreakdownProps) => {
  const { registrationPeriod } = getRegistrationDisplayDates(duration)

  const days = Math.floor(duration / 86400)
  const baseDate = selectedName.expiryDate
    ? dateToPlainDate(selectedName.expiryDate)
    : getStartOfToday()
  const newExpiry = baseDate.add({ days })
  const newExpiryFormatted = formatExpiryDate(newExpiry)

  const { pricePerYear, years } = getPricingBreakdown(
    selectedName.name,
    price,
    duration,
  )

  return (
    <dl className="space-y-2">
      <SummaryRow label="Extension:" value={registrationPeriod} />
      <SummaryRow label="New expiry:" value={newExpiryFormatted} />

      <hr className="border-border my-3" />

      {Math.round(years * 12) >= 12 && (
        <SummaryRow
          label="Price:"
          value={`${formatUsd(pricePerYear)}/year × ${Math.round(years)}`}
        />
      )}

      <SummaryRow
        label="Subtotal:"
        value={formatPriceDisplay(price.base, price.decimals)}
        valueClassName="flex items-center gap-1 m-0"
      />

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
  )
}
