import { useQuery } from '@tanstack/react-query'
import { InfoIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PremiumPill } from '@/features/register/components/PremiumPill'
import { TemporaryPremiumDrawer } from '@/features/register/components/TemporaryPremiumDrawer'
import {
  getRegistrationPriceQueryOptions,
  type RegistrationPriceResult,
} from '@/features/register/hooks/useRegistrationPrice'
import {
  getPremiumLabel,
  validateNameLength,
} from '@/features/register/utils/premium'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'

function isPriceResult(value: unknown): value is RegistrationPriceResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'base' in value &&
    'total' in value
  )
}

type RegisterNameCheckoutSummaryProps = {
  name: string
  duration: number
  durationLabel: string
  onContinue?: () => void
}

const EST_GAS_USD = 0.05

export const RegisterNameCheckoutSummary = ({
  name,
  duration,
  durationLabel,
  onContinue,
}: RegisterNameCheckoutSummaryProps) => {
  const [premiumDrawerOpen, setPremiumDrawerOpen] = useState(false)
  const isNameValid = !validateNameLength(name)

  const {
    data: price,
    isLoading,
    isError,
    error,
  } = useQuery({
    ...getRegistrationPriceQueryOptions({ name, durationYears: duration }),
    enabled: Boolean(name) && duration >= 1 && isNameValid,
  })

  const isReady = !isLoading && !isError && price
  const canContinue = isReady && price

  return (
    <section
      className="border border-border rounded-lg bg-card p-5"
      aria-labelledby="checkout-heading"
    >
      <h2 id="checkout-heading" className="text-lg font-semibold mb-4">
        Registration summary
      </h2>

      {isLoading ? (
        <PriceBreakdownSkeleton
          durationLabel={durationLabel}
          premiumLabel={getPremiumLabel(name)}
        />
      ) : isError ? (
        <div className="border border-border rounded-md p-4">
          <p className="text-destructive text-sm">
            Failed to load price. Please try again.
          </p>
          <pre className="mt-2 text-xs overflow-auto max-h-24 text-muted-foreground">
            {error instanceof Error
              ? `${error.message}${(error as { cause?: unknown }).cause ? `\nCause: ${String((error as { cause?: unknown }).cause)}` : ''}`
              : String(error)}
          </pre>
        </div>
      ) : price && isPriceResult(price) ? (
        <PriceBreakdown
          name={name}
          price={price}
          durationLabel={durationLabel}
          onOpenPremiumDrawer={() => setPremiumDrawerOpen(true)}
        />
      ) : (
        <div className="border border-border rounded-md p-4">
          <p className="text-muted-foreground text-sm">Unable to load price</p>
        </div>
      )}

      <Button
        className="w-full mt-4 h-12"
        onClick={onContinue}
        disabled={!canContinue}
      >
        Continue
      </Button>

      {price && isPriceResult(price) && price.hasPremium && (
        <TemporaryPremiumDrawer
          open={premiumDrawerOpen}
          onOpenChange={setPremiumDrawerOpen}
          currentPremium={price.premium}
        />
      )}
    </section>
  )
}

type PriceBreakdownSkeletonProps = {
  durationLabel: string
  premiumLabel: ReturnType<typeof getPremiumLabel>
}

const PriceBreakdownSkeleton = ({
  durationLabel,
  premiumLabel,
}: PriceBreakdownSkeletonProps) => (
  <div className="space-y-3">
    {premiumLabel && (
      <div className="flex flex-wrap items-center gap-2">
        <PremiumPill
          label={premiumLabel.label}
          variant={premiumLabel.variant}
        />
      </div>
    )}
    <dl className="space-y-3">
      <div className="flex items-center justify-between">
        <dt className="text-base font-normal">{durationLabel} registration</dt>
        <dd className="flex items-center gap-1 m-0">
          <Skeleton className="h-5 w-12" />
          <span className="text-xs">USD</span>
        </dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-base font-normal">Est. gas cost</dt>
        <dd className="flex items-center gap-1 m-0 text-muted-foreground text-sm">
          <span className="font-mono">~{formatUsd(EST_GAS_USD)}</span>
          <span className="text-xs">USD</span>
        </dd>
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <dt className="text-xl font-bold">Est. total</dt>
        <dd className="flex items-center gap-1 m-0">
          <Skeleton className="h-7 w-14" />
          <span className="text-xs">USD</span>
        </dd>
      </div>
      <p className="text-xs text-muted-foreground pt-1">
        Paid in USDC or DAI. Gas cost is an approximation.
      </p>
    </dl>
  </div>
)

type PriceBreakdownProps = {
  name: string
  price: RegistrationPriceResult
  durationLabel: string
  onOpenPremiumDrawer?: () => void
}

const PriceBreakdown = ({
  name,
  price,
  durationLabel,
  onOpenPremiumDrawer,
}: PriceBreakdownProps) => {
  const premiumLabel = getPremiumLabel(name)

  return (
    <div className="space-y-3">
      {premiumLabel && (
        <div className="flex flex-wrap items-center gap-2">
          <PremiumPill
            label={premiumLabel.label}
            variant={premiumLabel.variant}
          />
        </div>
      )}
      <dl className="space-y-3">
        <div className="flex items-center justify-between">
          <dt className="text-base font-normal">
            {durationLabel} registration
          </dt>
          <dd className="flex items-center gap-1 m-0">
            <span className="font-mono text-base font-medium">
              {price.base}
            </span>
            <span className="text-xs">USD</span>
          </dd>
        </div>

        {price.hasPremium && (
          <div className="flex items-center justify-between">
            <dt className="text-base font-normal flex items-center gap-1">
              Temporary premium{' '}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={onOpenPremiumDrawer}
                aria-label="Learn more about temporary premium"
              >
                <InfoIcon className="size-3.5" />
              </Button>
            </dt>
            <dd className="flex items-center gap-1 m-0">
              <span className="font-mono text-base font-medium">
                {price.premium}
              </span>
              <span className="text-xs">USD</span>
            </dd>
          </div>
        )}

        <div className="flex items-center justify-between">
          <dt className="text-base font-normal">Est. gas cost</dt>
          <dd className="flex items-center gap-1 m-0 text-muted-foreground text-sm">
            <span className="font-mono">~{formatUsd(EST_GAS_USD)}</span>
            <span className="text-xs">USD</span>
          </dd>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <dt className="text-xl font-bold">Est. total</dt>
          <dd className="flex items-center gap-1 m-0">
            <span className="font-mono text-xl font-bold">{price.total}</span>
            <span className="text-xs">USD</span>
          </dd>
        </div>

        <p className="text-xs text-muted-foreground pt-1">
          Paid in USDC or DAI. Gas cost is an approximation.
        </p>
      </dl>
    </div>
  )
}
