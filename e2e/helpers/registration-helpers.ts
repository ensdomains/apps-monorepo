import type { Page } from '@playwright/test'
import { testClient } from './anvil-client.js'

/** MIN_COMMITMENT_AGE (60s on the v2 ETHRegistrar) + a small buffer. */
const COMMIT_SKIP_SECONDS = 70

/**
 * Programmatically skip the registration commitment cooldown — the code
 * equivalent of the dev Time Travel panel's "Skip commit wait" button, so the
 * registration specs don't burn the ~60s MIN_COMMITMENT_AGE in real time.
 *
 * Run this CONCURRENTLY with the buy/registration flow. Until `isComplete()`
 * reports success it repeatedly:
 *   1. advances the Anvil chain (so the on-chain `register` is valid:
 *      block.timestamp >= commitmentAt + MIN_COMMITMENT_AGE), and
 *   2. resyncs the in-app time-travel clock so the browser's `Date.now()` jumps
 *      past the cooldown target. The app's cooldown polls `Date.now()` with a
 *      real setTimeout (the dev clock patches Date, not timers), so it releases
 *      within one tick.
 *
 * Polling (rather than a single shot keyed off a UI string) keeps it robust to
 * exactly when the cooldown becomes active. Requires VITE_TIME_TRAVEL=1 (the
 * dev clock is installed); without it the browser resync is a no-op and the
 * cooldown falls back to waiting in real time (still correct, just slow).
 */
export async function skipCommitmentCooldown(
  page: Page,
  isComplete: () => boolean,
  {
    seconds = COMMIT_SKIP_SECONDS,
    intervalMs = 1_500,
    maxIterations = 80,
  }: { seconds?: number; intervalMs?: number; maxIterations?: number } = {},
): Promise<void> {
  for (let i = 0; i < maxIterations && !isComplete(); i += 1) {
    await testClient.increaseTime({ seconds })
    await testClient.mine({ blocks: 1 })
    await page.evaluate(async () => {
      await (
        globalThis as {
          __ensChainClockInstalled?: { syncFromChain?: () => Promise<unknown> }
        }
      ).__ensChainClockInstalled?.syncFromChain?.()
    })
    try {
      await page.waitForTimeout(intervalMs)
    } catch {
      // Page/context torn down (test finished/failed) — stop polling.
      return
    }
  }
}
