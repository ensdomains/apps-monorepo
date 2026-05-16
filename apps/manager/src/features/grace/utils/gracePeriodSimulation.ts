/**
 * REMOVE_BEFORE_GRACE_PR
 * -------------------------------
 * Local testing only: simulate grace-period UX when `VITE_FF_SIMULATE_GRACE_PERIOD=true`
 * (dev). Delete this file for the real PR, then:
 * - Revert simulation wiring in `gracePeriod.ts` (search REMOVE_BEFORE_GRACE_PR).
 * - Remove `VITE_FF_SIMULATE_GRACE_PERIOD` from `apps/manager/.env.example`.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Days "since expiry" when simulating grace (stable demo copy). */
export const SIMULATED_DAYS_SINCE_EXPIRY = 12

/** Dev-only: enabled when `VITE_FF_SIMULATE_GRACE_PERIOD=true` in `.env.local`. */
export const isGracePeriodSimulationEnabled = (): boolean =>
  import.meta.env.DEV &&
  import.meta.env.VITE_FF_SIMULATE_GRACE_PERIOD === 'true'

export const getSimulatedExpiryDate = (now: Date = new Date()): Date =>
  new Date(now.getTime() - SIMULATED_DAYS_SINCE_EXPIRY * MS_PER_DAY)
