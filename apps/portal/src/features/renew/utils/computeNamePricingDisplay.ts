import { formatUnits } from 'viem'
import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import { getEffectivePricePerYearUsd } from '@/features/register/utils/effectivePricePerYear'
import { getRegistrationDisplayDates } from '@/features/register/utils/registrationDuration'
import {
  formatPriceDisplay,
  formatRegistrationTotal,
} from '@/features/register/utils/registrationPrice'
import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'
import { ORACLE_PRICE_DECIMALS } from '@/lib/constants/oracle'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { dateToPlainDate } from '@/utils/temporal'
import type { SelectedName } from '../hooks/useRenewalTransactions'

export type NamePricingDisplay = {
  /** e.g. "3 years" */
  readonly registrationPeriod: string
  /** e.g. "Mar 11, 2029" */
  readonly newExpiryFormatted: string
  /** Always "Price:" — the discount is surfaced via discountSublabel */
  readonly priceLabel: string
  /** e.g. "$650/year" — per-year only; total is shown on the Total row */
  readonly priceValue: string
  /** Small green sublabel under price, e.g. "3+ yr discount price". `undefined` when no discount. */
  readonly discountSublabel: string | undefined
  /** Formatted base price e.g. "$1,462.50" */
  readonly subtotal: string
  /** Formatted base + premium total e.g. "$1,462.50" */
  readonly total: string
  /** Raw USD amount (base only) for computing multi-name totals */
  readonly actualPrice: number
  /** Raw USD discount amount for computing multi-name total savings */
  readonly discountAmount: number
}

/**
 * Pure function — computes all display values for a single name given a fetched price.
 * Shared between single-name and multi-name renewal flows.
 *
 * @param baseRate Per-second oracle base rate (12 decimals). Used to derive the
 *   undiscounted baseline for the multi-year discount amount. Pass 0n when
 *   unavailable; discountAmount will be 0.
 */
export function computeNamePricingDisplay(
  selectedName: SelectedName,
  price: RegistrationPriceResult,
  duration: number,
  baseRate: bigint,
): NamePricingDisplay {
  const { registrationPeriod, expiresFormatted: newExpiryFormatted } =
    getRegistrationDisplayDates(
      duration,
      selectedName.expiryDate
        ? dateToPlainDate(selectedName.expiryDate)
        : undefined,
    )

  const years = duration / CONTRACT_SECONDS_PER_YEAR
  const roundedYears = Math.round(years)
  const discountSublabel =
    roundedYears >= 2 ? `${roundedYears}+ yr discount price` : undefined

  const actualPrice = Number(formatUnits(price.base, price.decimals))
  // Quote the rate over the whole years the summary says you are buying, not
  // fractional contract years. A term crossing a leap day is 366 days = 1.002
  // contract years, so dividing by that prints a per-year figure a cent under
  // the total it sits next to. Falls back to the rate estimate while the price
  // is still loading.
  const effectivePerYear =
    roundedYears >= 1 && actualPrice > 0
      ? actualPrice / roundedYears
      : getEffectivePricePerYearUsd({
          priceBase: price.base,
          priceDecimals: price.decimals,
          durationSeconds: duration,
          baseRate,
        })

  const undiscountedBase =
    baseRate > 0n
      ? Number(
          formatUnits(
            baseRate * BigInt(Math.round(duration)),
            ORACLE_PRICE_DECIMALS,
          ),
        )
      : 0
  const discountAmount = Math.max(undiscountedBase - actualPrice, 0)

  // `≈` because the rate is the total divided by the term and then rounded to
  // cents: multiplying it back out misses the total by up to half a cent per
  // year (6 × $4.5033 is $27.02, but the rounded $4.50 × 6 reads as $27.00).
  // The total below is the exact charge; this row is a comparison figure.
  const priceValue =
    Math.round(years * 12) >= 12
      ? `≈ ${formatUsd(effectivePerYear)}/year`
      : formatUsd(effectivePerYear)

  return {
    registrationPeriod,
    newExpiryFormatted,
    priceLabel: 'Price:',
    priceValue,
    discountSublabel,
    subtotal: formatPriceDisplay(price.base, price.decimals),
    total: formatRegistrationTotal(price.base, price.premium, price.decimals),
    actualPrice,
    discountAmount,
  }
}
