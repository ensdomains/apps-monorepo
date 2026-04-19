/**
 * Anvil snapshot fixture — provides chain-state isolation between tests.
 *
 * Takes an `evm_snapshot` before the test runs and reverts to it afterwards.
 * This restores the full Anvil state (block timestamp, nonces, balances,
 * contract storage) so tests that warp time (e.g. temporary premium) don't
 * leak into later tests.
 *
 * Usage: add `anvilSnapshot` to your fixture's type and extend call.
 * The fixture is auto-use, so you don't need to reference it in tests.
 */
import { testClient } from '../helpers/anvil-client.js'

export type AnvilSnapshotFixture = {
  /** Auto-use fixture — no need to reference in tests. */
  anvilSnapshot: void
}

/**
 * Playwright fixture definition.
 * Merge into your test.extend<>() call:
 *
 *   test.extend<MyFixtures & AnvilSnapshotFixture>({
 *     ...anvilSnapshotFixture,
 *     // other fixtures
 *   })
 */
export const anvilSnapshotFixture = {
  anvilSnapshot: [
    async ({}, use: (value: void) => Promise<void>) => {
      let snapshotId: `0x${string}` | undefined
      try {
        snapshotId = await testClient.snapshot()
      } catch {
        // Anvil not reachable — skip snapshot isolation.
        // Tests that need Anvil will fail with their own errors.
        console.warn(
          '[anvilSnapshot] Could not take snapshot (Anvil unreachable?) — skipping isolation',
        )
      }

      await use()

      if (snapshotId) {
        try {
          await testClient.revert({ id: snapshotId })
        } catch {
          console.warn('[anvilSnapshot] Could not revert snapshot')
        }
      }
    },
    { auto: true },
  ] as const,
}
