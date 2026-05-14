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
import { useBaseRate } from '@/features/register/hooks/useBaseRate'
import { getOracleParamsQueryOptions } from '@/features/register/hooks/useOracleParams'
import {
  getRegistrationPriceQueryOptions,
  type RegistrationPriceResult,
} from '@/features/register/hooks/useRegistrationPrice'
import { getEffectivePricePerYearUsd } from '@/features/register/utils/effectivePricePerYear'
import { getPremiumLabel } from '@/features/register/utils/premium'
import { getPremiumInstantRangeFromPrice } from '@/features/register/utils/premiumDecay'
import { getRegistrationDisplayDates } from '@/features/register/utils/registrationDuration'
import {
  formatPriceDisplay,
  formatRegistrationTotal,
  isPriceResult,
} from '@/features/register/utils/registrationPrice'
import { TransactionErrorAlert } from '@/features/registry/components/TransactionErrorAlert'
import { getTransactionErrorInfo } from '@/features/registry/utils/transactionErrorMessage'
import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'
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

  const { data: oracleData } = useQuery(getOracleParamsQueryOptions)
  const baseRate = useBaseRate(name)

  const premiumDecayConfig = oracleData?.premiumDecay

  const hasPrice = price && isPriceResult(price)
  const premiumRange =
    hasPrice && price
      ? getPremiumInstantRangeFromPrice(price, premiumDecayConfig)
      : null

  return (
    <Fragment>
      {premiumRange && (
        <Alert variant="default" className="flex p-5 items-center">
          <AlertDescription className="text-base flex flex-col md:flex-row items-center justify-center md:justify-between gap-4">
            <SirenIcon className="size-6 shrink-0" />
            <p className="text-center md:text-left">
              This name is in Temporary premium until{' '}
              {formatExpiryDateTimeLocal(premiumRange.end)}.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="text-primary text-sm"
              onClick={() => setPremiumDrawerOpen(true)}
            >
              Learn more
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <section
        className="border border-border rounded-sm p-5"
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
              <PriceBreakdown
                name={name}
                price={price}
                duration={duration}
                baseRate={baseRate}
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

        {hasPrice && price.hasPremium && premiumDecayConfig && (
          <TemporaryPremiumDrawer
            open={premiumDrawerOpen}
            onOpenChange={setPremiumDrawerOpen}
            currentPremium={formatPriceDisplay(price.premium, price.decimals)}
            premiumStart={premiumRange?.start ?? null}
            premiumDecayConfig={premiumDecayConfig}
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
    <dt className={cn('font-normal text-foreground', labelClassName)}>
      {label}
    </dt>
    <dd className={cn('m-0 font-normal text-foreground', valueClassName)}>
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
  readonly baseRate: bigint
}

const PriceBreakdown = ({
  name,
  price,
  duration,
  baseRate,
}: PriceBreakdownProps) => {
  const { registrationPeriod, expiresFormatted } =
    getRegistrationDisplayDates(duration)

  const years = duration / CONTRACT_SECONDS_PER_YEAR
  const pricePerYear = getEffectivePricePerYearUsd({
    priceBase: price.base,
    priceDecimals: price.decimals,
    durationSeconds: duration,
    baseRate,
  })
  const premiumLabel = getPremiumLabel(name)
  // const roundedYears = Math.round(years)
  // const discountSublabel =
  //   roundedYears >= 2 ? `${roundedYears}+ yr discount price` : undefined

  return (
    <div className="space-y-2">
      <dl className="space-y-2">
        <SummaryRow label="Registration:" value={registrationPeriod} />
        <SummaryRow label="Expires:" value={expiresFormatted} />

        <hr className="border-border my-3" />

        {price.hasPremium && (
          <SummaryRow
            label={'Temp premium:'}
            value={formatPriceDisplay(price.premium, price.decimals)}
            labelClassName="font-medium text-foreground"
            valueClassName="font-medium text-foreground"
          />
        )}

        {pricePerYear > 0 && Math.round(years * 12) >= 12 && (
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
            value={
              <span className="flex flex-col items-end m-0">
                <span>{`${formatUsd(pricePerYear)}/year`}</span>
                {/* {discountSublabel ? (
                  <span className="text-xs text-success-text">
                    {discountSublabel}
                  </span>
                ) : null} */}
              </span>
            }
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
