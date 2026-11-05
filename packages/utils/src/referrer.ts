import { type Hex, zeroHash } from 'viem'

/**
 * Left-pad hexadecimal referrers to bytes32. Missing, invalid or zero values
 * mean no referrer and return `fallback`, so a bad link never blocks a
 * transaction.
 */
export function normalizeReferrer(
  value: unknown,
  fallback: Hex = zeroHash,
): Hex {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) {
    return fallback
  }
  const referrer: Hex = `0x${value.slice(2).padStart(64, '0').toLowerCase()}`
  return referrer === zeroHash ? fallback : referrer
}

/** Keep the supplied URL value for attribution; transaction flows normalize their own copy. */
export function referrerSearch(search: Readonly<Record<string, unknown>>): {
  readonly referrer?: string
} {
  return {
    referrer: typeof search.referrer === 'string' ? search.referrer : undefined,
  }
}
