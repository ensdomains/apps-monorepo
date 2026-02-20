import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'

/** Token decimals for registration price display (USDC default) */
export const REGISTRATION_PRICE_DECIMALS = 6

/**
 * Adds USD amount to a token amount (in smallest units) and formats as USD.
 * Keeps arithmetic on bigint to avoid floating-point issues; formats once at the end.
 */
export function formatTotalWithGasAndFees(
  totalRaw: bigint,
  gasAndFeesUsd: number,
  decimals: number = REGISTRATION_PRICE_DECIMALS,
): string {
  const gasAndFeesInUnits = BigInt(Math.round(gasAndFeesUsd * 10 ** decimals))
  const totalWithFees = totalRaw + gasAndFeesInUnits
  const totalAsNumber = Number(totalWithFees) / 10 ** decimals
  return formatUsd(totalAsNumber)
}

export function isPriceResult(
  value: unknown,
): value is RegistrationPriceResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'base' in value &&
    'total' in value &&
    'totalRaw' in value
  )
}
