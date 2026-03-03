import { formatUnits } from 'viem'
import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import { USDC_DECIMALS } from '@/lib/constants/tokens'
import { formatUsd, formatUsdCeil } from '@/utils/formatting/formatUsdCeil'

export const EST_GAS_USD = 0.05

/**
 * Formats a raw token amount (smallest units) as USD for display.
 */
export function formatPriceDisplay(raw: bigint, decimals: number): string {
  return formatUsdCeil(formatUnits(raw, decimals))
}

/**
 * Adds USD amount to token amounts (in smallest units) and formats as USD.
 * Uses Math.ceil for base and premium to match formatPriceDisplay, so the
 * displayed total equals the sum of displayed line items.
 */
export function formatTotalWithGas(
  base: bigint,
  premium: bigint,
  gasUsd: number,
  decimals: number = USDC_DECIMALS,
): string {
  const baseUsd = Number(base) / 10 ** decimals
  const premiumUsd = Number(premium) / 10 ** decimals
  const registrationCeil = Math.ceil(baseUsd) + Math.ceil(premiumUsd)
  const totalWithFees = registrationCeil + gasUsd
  return formatUsd(totalWithFees)
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
