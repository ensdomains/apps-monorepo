/**
 * Shared virtual clock for the temporary-premium simulation.
 *
 * Two surfaces need to see the same "now" for the cart total and the banner
 * pill to stay in sync:
 *
 *   1. `useTickingNowMs` (drives the chart's `nowPoint` and the banner's
 *      live currentPremiumLabel via getPremiumPriceAtInstant)
 *   2. `buildMockedPricing` (drives the cart total via the pricing query)
 *
 * Without sharing, the hook ticks at scale × real time while the mock runs
 * at real time, so the banner pill races ahead of the cart total. Sharing a
 * single clock module + anchor + scale fixes that — every consumer sees the
 * same instant.
 *
 * In production (no `VITE_FF_MOCK_TEMP_PREMIUM_TIME_SCALE` set) the scale
 * defaults to 1 and `mockNow()` is identical to `Date.now()`, so this file
 * has no runtime effect outside the mocked dev flow.
 */

const RAW_SCALE = import.meta.env.VITE_FF_MOCK_TEMP_PREMIUM_TIME_SCALE
const PARSED_SCALE = Number.parseFloat(RAW_SCALE ?? '')

/** Wall-clock multiplier for virtual time. 1 = no acceleration. */
export const MOCK_TIME_SCALE: number =
  Number.isFinite(PARSED_SCALE) && PARSED_SCALE > 0 ? PARSED_SCALE : 1

/**
 * Single anchor captured at module load. All `mockNow()` calls compute their
 * result relative to this anchor, so consumers imported at different times
 * (the hook on first render, the mock on first contract call) still resolve
 * to the same virtual instant.
 */
const BOOT_MS = Date.now()

/**
 * Real-time bucket size for quantizing mockNow output (in ms).
 *
 * Without this, every call to `mockNow()` returns a slightly different
 * value, and under high TIME_SCALE that "slight" difference is amplified:
 * with scale=600, a 50ms jitter between parallel pricing queries becomes
 * 30 seconds of virtual decay, which at the steep part of the curve is
 * hundreds of dollars of disagreement between the 1y/3y/6y preset totals.
 *
 * Quantizing makes all `mockNow()` calls within the same 200ms real window
 * return identical virtual times. The banner pill samples once per second,
 * the pricing query refetches every 2s, both well outside the bucket — so
 * neither animation suffers. Parallel `useQueries` calls (which fire within
 * a few ms of each other) all land in the same bucket and share a premium.
 */
const QUANTUM_MS = 200

let cachedQuantum: { realMs: number; virtualMs: number } | null = null

/**
 * Returns the current "now" in the virtual timeline.
 * - With scale = 1: identical to `Date.now()` (no bucketing — production path).
 * - With scale > 1: `BOOT_MS + (real elapsed) × scale`, quantized to
 *   QUANTUM_MS so parallel callers share a virtual instant.
 *
 * Stable reference — safe to pass directly to `useTickingNowMs(_, _, mockNow)`
 * without triggering effect re-runs.
 */
export function mockNow(): number {
  if (MOCK_TIME_SCALE === 1) return Date.now()
  const realNow = Date.now()
  if (cachedQuantum && realNow - cachedQuantum.realMs < QUANTUM_MS) {
    return cachedQuantum.virtualMs
  }
  const virtualMs = BOOT_MS + (realNow - BOOT_MS) * MOCK_TIME_SCALE
  cachedQuantum = { realMs: realNow, virtualMs }
  return virtualMs
}
