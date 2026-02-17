import { useQuery } from '@tanstack/react-query'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { PremiumPill } from '@/features/register/components/PremiumPill'
import {
  getRegistrationPriceQueryOptions,
  type RegistrationPriceResult,
} from '@/features/register/hooks/useRegistrationPrice'
import { getPremiumLabel } from '@/features/register/utils/premium'
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
  const {
    data: price,
    isLoading,
    isError,
    error,
  } = useQuery({
    ...getRegistrationPriceQueryOptions({ name, durationYears: duration }),
    enabled: Boolean(name) && duration >= 1,
  })

  const isReady = !isLoading && !isError && price
  const canContinue = isReady && price

  return (
    <section
      className="py-9 lg:border-l lg:border-border p-6 col-span-2"
      aria-labelledby="checkout-heading"
    >
      <h2 id="checkout-heading" className="text-3xl font-medium mb-4">
        Register name
      </h2>

      {isLoading ? (
        <div className="border border-border rounded-md p-4">
          <LoadingSpinner title="Loading price..." />
        </div>
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
    </section>
  )
}

type PriceBreakdownProps = {
  name: string
  price: RegistrationPriceResult
  durationLabel: string
}

const PriceBreakdown = ({
  name,
  price,
  durationLabel,
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
      <dl className="border border-border rounded-md p-4 space-y-3">
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
            <dt className="text-base font-normal text-muted-foreground">
              {premiumLabel?.label ?? 'Premium (short name)'}
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
