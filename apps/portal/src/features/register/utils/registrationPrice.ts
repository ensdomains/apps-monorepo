import { formatUnits } from 'viem'
import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import { USDC_DECIMALS } from '@/lib/constants/tokens'
import { formatUsd, formatUsdCeil } from '@/utils/formatting/formatUsdCeil'

/**
 * Formats a raw token amount (smallest units) as USD for display.
 */
export function formatPriceDisplay(raw: bigint, decimals: number): string {
  return formatUsdCeil(formatUnits(raw, decimals))
}

/**
 * Adds USD amount to a token amount (in smallest units) and formats as USD.
 * Keeps arithmetic on bigint to avoid floating-point issues; formats once at the end.
 */
export function formatTotalWithGasAndFees(
  total: bigint,
  gasAndFeesUsd: number,
  decimals: number = USDC_DECIMALS,
): string {
  const gasAndFeesInUnits = BigInt(Math.round(gasAndFeesUsd * 10 ** decimals))
  const totalWithFees = total + gasAndFeesInUnits
  const totalAsNumber = Number(totalWithFees) / 10 ** decimals
  return formatUsd(totalAsNumber)
}

export function isPriceResult(
  value: unknown,
): value is RegistrationPriceResult {
  if (typeof value !== 'object' || value === null) return false

  const v = value as Record<string, unknown>

  return (
    typeof v.base === 'bigint' &&
    typeof v.premium === 'bigint' &&
    typeof v.total === 'bigint' &&
    typeof v.decimals === 'number' &&
    typeof v.hasPremium === 'boolean'
  )
}
