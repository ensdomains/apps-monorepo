import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useQuery } from '@tanstack/react-query'
import { InfoIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { ExternalLink } from 'react-external-link'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PaymentTokenModal } from '@/features/register/components/PaymentTokenModal'
import { PremiumPill } from '@/features/register/components/PremiumPill'
import { TemporaryPremiumDrawer } from '@/features/register/components/TemporaryPremiumDrawer'
import {
  getRegistrationPriceQueryOptions,
  type RegistrationPriceResult,
} from '@/features/register/hooks/useRegistrationPrice'
import { getPremiumLabel } from '@/features/register/utils/premium'
import { getDiscountForYears } from '@/features/register/utils/registrationDiscount'
import {
  calculateDurationFromDate,
  formatRegistrationDuration,
  getRegistrationExpiryDateFromSeconds,
  getStartOfToday,
} from '@/features/register/utils/registrationDuration'
import {
  formatPriceDisplay,
  formatTotalWithGas,
  isPriceResult,
} from '@/features/register/utils/registrationPrice'
import { TransactionErrorAlert } from '@/features/registry/components/TransactionErrorAlert'
import { getTransactionErrorInfo } from '@/features/registry/utils/transactionErrorMessage'
import { cn } from '@/lib/utils'
import { formatExpiryDate } from '@/utils/formatting/formatDateTime'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { validateNameLength } from '@/utils/token/nameValidation'

type RegisterNameCheckoutSummaryProps = {
  readonly name: string
  readonly duration: number
  readonly durationLabel: string
  readonly onContinue: (selectedToken: Address, tokenPrice: bigint) => void
}

/** ENS docs explaining premium pricing for short names */
const ENS_PREMIUM_PRICING_DOCS_URL =
  'https://docs.ens.domains/registry/eth/#3-4-and-5-letter-names'

export const RegisterNameCheckoutSummary = ({
  name,
  duration,
  durationLabel,
  onContinue,
}: RegisterNameCheckoutSummaryProps) => {
  const [premiumDrawerOpen, setPremiumDrawerOpen] = useState(false)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const isNameValid = !validateNameLength(name)

  const { address, isConnected } = useConnection()
  const { openConnectModal } = useConnectModal()

  const {
    data: price,
    isLoading,
    isError,
    error,
  } = useQuery({
    ...getRegistrationPriceQueryOptions({
      name,
      duration,
    }),
    enabled: Boolean(name) && duration > 0 && isNameValid,
  })

  const isReady = !isLoading && !isError && price
  const hasPrice = price && isPriceResult(price)

  const canContinue = isReady && hasPrice && isConnected && Boolean(address)

  const handleContinueClick = () => {
    if (canContinue) setPaymentModalOpen(true)
  }

  return (
    <section
      className="border border-border rounded-lg bg-card p-5"
      aria-labelledby="checkout-heading"
    >
      {match({ isLoading, isError, hasPrice })
        .with({ isLoading: true }, () => (
          <PriceBreakdownSkeleton
            durationLabel={durationLabel}
            premiumLabel={getPremiumLabel(name)}
          />
        ))
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
            <PriceBreakdown
              name={name}
              price={price}
              duration={duration}
              onOpenPremiumDrawer={() => setPremiumDrawerOpen(true)}
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

      {match({ isConnected, openConnectModal })
        .when(
          ({ isConnected, openConnectModal }) =>
            !isConnected && typeof openConnectModal === 'function',
          ({ openConnectModal }) => (
            <Button
              className="w-full mt-4 h-12"
              onClick={() => openConnectModal?.()}
              type="button"
            >
              Connect Wallet
            </Button>
          ),
        )
        .when(
          ({ isConnected }) => !isConnected,
          () => (
            <Button className="w-full mt-4 h-12" disabled type="button">
              Wallet not connected
            </Button>
          ),
        )
        .otherwise(() => (
          <Button
            className="w-full mt-4 h-12"
            onClick={handleContinueClick}
            disabled={!canContinue}
          >
            {isLoading ? 'Loading...' : 'Continue'}
          </Button>
        ))}

      <PaymentTokenModal
        open={paymentModalOpen}
        onOpenChange={setPaymentModalOpen}
        name={name}
        duration={duration}
        onConfirm={onContinue}
      />

      {hasPrice && price.hasPremium && (
        <TemporaryPremiumDrawer
          open={premiumDrawerOpen}
          onOpenChange={setPremiumDrawerOpen}
          currentPremium={formatPriceDisplay(price.premium, price.decimals)}
        />
      )}
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
  <div className={cn('flex items-center justify-between', className)}>
    <dt className={cn('text-base font-normal text-quartz-350', labelClassName)}>
      {label}
    </dt>
    <dd className={cn('m-0 font-normal text-quartz-900', valueClassName)}>
      {value}
    </dd>
  </div>
)

type PriceBreakdownSkeletonProps = {
  readonly durationLabel: string
  readonly premiumLabel: ReturnType<typeof getPremiumLabel>
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
        <ExternalLink
          href={ENS_PREMIUM_PRICING_DOCS_URL}
          className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
        >
          Learn more
        </ExternalLink>
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
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <dt className="text-xl font-bold">Est. total</dt>
        <dd className="flex items-center gap-1 m-0">
          <Skeleton className="h-7 w-14" />
          <span className="text-xs">USD</span>
        </dd>
      </div>
      <p className="text-xs text-muted-foreground pt-1">
        Paid in USDC or DAI. Gas and network fees are approximations.
      </p>
    </dl>
  </div>
)

type PriceBreakdownProps = {
  readonly name: string
  readonly price: RegistrationPriceResult
  readonly duration: number
  readonly onOpenPremiumDrawer: () => void
}

const PriceBreakdown = ({
  name,
  price,
  duration,
  onOpenPremiumDrawer,
}: PriceBreakdownProps) => {
  const premiumLabel = getPremiumLabel(name)
  const startOfToday = getStartOfToday()
  const expiryDate = getRegistrationExpiryDateFromSeconds(
    startOfToday,
    duration,
  )
  const years = calculateDurationFromDate(startOfToday, expiryDate)
  const registrationDuration = formatRegistrationDuration(
    startOfToday,
    expiryDate,
  )
  const expiryFormatted = formatExpiryDate(expiryDate)

  const { percent: discountPercent, label: discountLabel } =
    getDiscountForYears(years)
  const baseUsd = Number(price.base) / 10 ** price.decimals
  const theoreticalSubtotal =
    discountPercent > 0 ? baseUsd / (1 - discountPercent / 100) : baseUsd
  const discountAmount = discountPercent > 0 ? theoreticalSubtotal - baseUsd : 0
  const pricePerYear = years > 0 ? theoreticalSubtotal / years : 0

  return (
    <div className="space-y-3">
      {premiumLabel && (
        <div className="flex flex-wrap items-center gap-2">
          <PremiumPill
            label={premiumLabel.label}
            variant={premiumLabel.variant}
          />
          <ExternalLink
            href={ENS_PREMIUM_PRICING_DOCS_URL}
            className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
          >
            Learn more
          </ExternalLink>
        </div>
      )}
      <dl className="space-y-3">
        <SummaryRow label="Registration" value={registrationDuration} />
        <SummaryRow label="Expires" value={expiryFormatted} />

        <hr className="border-border" />

        <SummaryRow
          label="Price"
          value={
            <span className="font-mono text-base">
              {formatUsd(pricePerYear)}/year × {years}
            </span>
          }
          valueClassName="m-0 text-base"
        />
        <SummaryRow
          label="Subtotal"
          value={
            <>
              <span className="font-mono text-base font-medium">
                {formatUsd(Math.ceil(theoreticalSubtotal))}
              </span>
              <span className="text-xs">USD</span>
            </>
          }
          valueClassName="flex items-center gap-1 m-0"
        />

        {discountPercent > 0 && (
          <SummaryRow
            label={`${discountLabel} discount (${discountPercent}%)`}
            value={
              <>
                <span className="font-mono text-base font-medium">
                  -{formatUsd(Math.ceil(discountAmount))}
                </span>
                <span className="text-xs">USD</span>
              </>
            }
            className="text-success"
            valueClassName="flex items-center gap-1 m-0"
          />
        )}

        {price.hasPremium && (
          <SummaryRow
            label={
              <>
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
              </>
            }
            value={
              <>
                <span className="font-mono text-base font-medium">
                  {formatPriceDisplay(price.premium, price.decimals)}
                </span>
                <span className="text-xs">USD</span>
              </>
            }
            labelClassName="text-base font-normal flex items-center gap-1"
            valueClassName="flex items-center gap-1 m-0"
          />
        )}

        <SummaryRow
          label="Total"
          value={
            <>
              <span className="font-mono text-xl font-bold">
                {formatTotalWithGas(price.base, price.premium, price.decimals)}
              </span>
              <span className="text-xs">USD</span>
            </>
          }
          className="pt-3 border-t border-border"
          labelClassName="text-xl font-bold"
          valueClassName="flex items-center gap-1 m-0"
        />

        <p className="text-xs text-muted-foreground pt-1">
          Paid in USDC or DAI. Gas and network fees are approximations.
        </p>
      </dl>
    </div>
  )
}
