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
      const snapshotId = await testClient.snapshot()
      await use()
      await testClient.revert({ id: snapshotId })
    },
    { auto: true },
  ] as const,
}
