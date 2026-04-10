import { formatUnits } from 'viem'
import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import { USDC_DECIMALS } from '@/lib/constants/tokens'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'

/**
 * Formats a raw token amount (smallest units) as USD for display (no rounding).
 */
export function formatPriceDisplay(raw: bigint, decimals: number): string {
  return formatUsd(Number(formatUnits(raw, decimals)))
}

/**
 * Formats base + premium as USD total (rounded to nearest dollar).
 */
export function formatRegistrationTotal(
  base: bigint,
  premium: bigint,
  decimals: number = USDC_DECIMALS,
): string {
  const baseUsd = Number(base) / 10 ** decimals
  const premiumUsd = Number(premium) / 10 ** decimals
  const totalUsd = baseUsd + premiumUsd
  return formatUsd(totalUsd)
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
