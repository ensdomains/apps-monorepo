import { type Hex, zeroHash } from 'viem'

/** Left-pad hexadecimal referrers to bytes32; missing or invalid values mean no referrer. */
export function normalizeReferrer(value: unknown): Hex {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) {
    return zeroHash
  }
  return `0x${value.slice(2).padStart(64, '0').toLowerCase()}`
}

/** Keep the supplied URL value for attribution; normalize only at the calldata boundary. */
export function referrerSearch(search: Record<string, unknown>): {
  referrer?: string
} {
  return {
    referrer: typeof search.referrer === 'string' ? search.referrer : undefined,
  }
}
