/**
 * DEV-only manual time-travel wiring for the manager.
 *
 * Importing this module installs a browser clock that tracks the Anvil fork's
 * block time (the manual-browser equivalent of Playwright's `page.clock`), so
 * grace-period / premium / expiry UIs reflect time warps. Everything here is
 * a no-op unless `import.meta.env.DEV && import.meta.env.VITE_TIME_TRAVEL` and
 * collapses away in production builds (the `DEV` guard is statically false).
 *
 * Manager is SSR (TanStack Start); the install is guarded to the client.
 */
import { installChainClock } from '@ens-apps/utils/time-travel/installChainClock'

/** Endpoint the panel uses to reach Anvil — Vite proxies `/rpc` → the fork. */
export const TIME_TRAVEL_RPC: string =
  (import.meta.env.VITE_TIME_TRAVEL_RPC as string | undefined) ?? '/rpc'

/** True only in dev builds with the flag set; statically false in production. */
export function isTimeTravelEnabled(): boolean {
  return (
    import.meta.env.DEV &&
    (import.meta.env.VITE_TIME_TRAVEL === '1' ||
      import.meta.env.VITE_TIME_TRAVEL === 'true')
  )
}

// Side effect: install the clock as early as possible (this module is imported
// first in `client.tsx`, before hydration). Guarded so it never runs on the
// server or in production.
if (
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  isTimeTravelEnabled()
) {
  installChainClock()
}
