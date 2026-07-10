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

/** Per-name renewal duration (seconds) for the active selection. */
export const durationForName = (
  selection: Selection,
  currentExpiry: number,
): number =>
  selection.kind === 'preset'
    ? yearsToSeconds(selection.years)
    : Math.max(0, Math.round(selection.targetMs / 1000 - currentExpiry))

/** The name's new expiry (seconds) after applying the active selection. */
export const newExpirySeconds = (
  selection: Selection,
  currentExpiry: number,
): number =>
  selection.kind === 'preset'
    ? currentExpiry + yearsToSeconds(selection.years)
    : Math.round(selection.targetMs / 1000)
