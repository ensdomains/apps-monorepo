import { formatUnits } from 'viem'
import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'

/** Oracle base rate decimals (matches StandardRentPriceOracle units) */
const ORACLE_BASE_RATE_DECIMALS = 12

/**
 * Computes the discount text to display on the registration success screen,
 * using the oracle's raw per-second base rate to derive the undiscounted price.
 *
 * Returns a human-readable string like
 * "2+ years discount (10%): -$1.50" when a multi-year discount applies,
 * or undefined when there is no discount or duration is under 2 years.
 *
 * @param baseRate - Raw per-second base rate from the oracle (12-decimal units). Pass 0n when unavailable.
 * @param price    - Registration price result from the contract.
 * @param durationSeconds - Registration duration in seconds.
 */
export function getOracleDiscountText(
  baseRate: bigint,
  price: RegistrationPriceResult,
  durationSeconds: number,
): string | undefined {
  const basePriceNumber = Number(formatUnits(price.base, price.decimals))
  const basePriceWithoutDiscount =
    baseRate > 0n
      ? Number(
          formatUnits(
            baseRate * BigInt(Math.round(durationSeconds)),
            ORACLE_BASE_RATE_DECIMALS,
          ),
        )
      : 0

  const discountAmount = Math.max(basePriceWithoutDiscount - basePriceNumber, 0)
  const discountPercentage =
    basePriceWithoutDiscount > 0
      ? Math.round((discountAmount / basePriceWithoutDiscount) * 100)
      : 0

  const years = durationSeconds / CONTRACT_SECONDS_PER_YEAR

  if (discountAmount > 0 && discountPercentage > 0 && years >= 2) {
    return `${Math.floor(years)}+ years discount (${discountPercentage}%): -${formatUsd(discountAmount)}`
  }

  return undefined
}
