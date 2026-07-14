import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { SECONDS_IN_YEAR } from '@/features/register-v2/utils/time'
import type { Selection } from './types'

/** Renewals are paid in stablecoins; USDC is the display/default coin. */
export const USDC = TOKENS.USDC

export type Preset = {
  readonly years: number
  readonly pillClassName: string
}

export const PRESETS: readonly Preset[] = [
  { years: 1, pillClassName: 'bg-ens-citrine-100 text-ens-citrine-500' },
  { years: 3, pillClassName: 'bg-ens-peridot-100 text-ens-peridot-500' },
  { years: 6, pillClassName: 'bg-ens-garnet-100 text-ens-garnet-500' },
]

/** Format a USD amount with cents, e.g. `$1,320.00` (or `—` when unknown). */
export const formatUsdAmount = (value: number): string =>
  Number.isFinite(value)
    ? value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '—'

export const yearsToSeconds = (years: number): number =>
  Math.round(years * SECONDS_IN_YEAR)

/**
 * Per-name renewal duration in seconds for the active selection. On-chain
 * durations are `bigint`; `targetMs` (a JS `Date` value) is converted to whole
 * seconds at this boundary before the `bigint` arithmetic.
 */
export const durationForName = (
  selection: Selection,
  currentExpiry: bigint,
): bigint => {
  if (selection.kind === 'preset')
    return BigInt(yearsToSeconds(selection.years))
  // Clamp to 0 so a target before the name's expiry never yields a negative
  // duration (the date picker prevents it, but stay defensive).
  const seconds = BigInt(Math.round(selection.targetMs / 1000)) - currentExpiry
  return seconds > 0n ? seconds : 0n
}

/** The name's new expiry (seconds) after applying the active selection. */
export const newExpirySeconds = (
  selection: Selection,
  currentExpiry: bigint,
): bigint =>
  selection.kind === 'preset'
    ? currentExpiry + BigInt(yearsToSeconds(selection.years))
    : BigInt(Math.round(selection.targetMs / 1000))
