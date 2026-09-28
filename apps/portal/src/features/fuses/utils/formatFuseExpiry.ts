// The wrapper's expiry is when burnt fuses stop applying: `_clearOwnerAndFuses`
// reads owner and fuses as cleared once it passes. A `.eth` 2LD's is its
// registrar expiry plus the 90-day grace, a subname's is capped at its parent's,
// and only ROOT_NODE/ETH_NODE carry `MAX_EXPIRY` (uint64 max) — the one case
// that never expires. ensjs maps an unset (0) expiry to null and returns the
// rest in *milliseconds*, so this must not scale by 1000 again (WEB-1330).
const MAX_EXPIRY_MS = (2n ** 64n - 1n) * 1000n

export function formatFuseExpiry(expiry: bigint | null): string | null {
  if (expiry === null) return null
  if (expiry >= MAX_EXPIRY_MS) return 'Never'

  return new Date(Number(expiry)).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  })
}
