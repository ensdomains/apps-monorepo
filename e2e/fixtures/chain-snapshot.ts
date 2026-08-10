/**
 * Per-test chain snapshot — plan item H5.
 *
 * Today every suite runs with `workers: 1`, which is a correctness crutch: the
 * tests depend on each other's chain state and would break if run in any other
 * order. Wrapping each test in `evm_snapshot` / `evm_revert` removes the
 * dependency, which is the precondition for lifting that setting.
 *
 * Two caveats that decide where this is usable:
 *
 * 1. `evm_revert` rewinds the chain but not the browser. Anything the page has
 *    already cached — a name it saw registered, a balance it read — survives
 *    the revert and is now wrong. Take the snapshot before the page has read
 *    any of the state the test mutates, or reload after reverting.
 * 2. Anvil discards a snapshot once it is reverted to, and reverting drops
 *    every snapshot taken after it. Nesting therefore only works
 *    innermost-first, which is what {@link withChainSnapshot} does.
 *
 * `@time` suites are the exception: they move the clock with
 * `setNextBlockTimestamp`, and reverting rewinds that too while the browser
 * clock stays where `fixtures/time.ts` put it. Keep those serial and let them
 * manage their own state.
 */

import { testClient } from '../helpers/anvil-client.js'

export type SnapshotId = `0x${string}`

/** Capture chain state. Returns the id to hand back to {@link revertTo}. */
export async function takeSnapshot(): Promise<SnapshotId> {
  return (await testClient.snapshot()) as SnapshotId
}

/**
 * Restore chain state captured by {@link takeSnapshot}.
 *
 * Anvil consumes the snapshot, so an id may be reverted to at most once.
 */
export async function revertTo(id: SnapshotId): Promise<void> {
  await testClient.revert({ id })
}

/**
 * Run `body` against a snapshot and roll the chain back afterwards, whether it
 * passed or threw. The rollback runs even on failure so one red test cannot
 * cascade into the next.
 */
export async function withChainSnapshot<T>(body: () => Promise<T>): Promise<T> {
  const id = await takeSnapshot()
  try {
    return await body()
  } finally {
    await revertTo(id)
  }
}

/**
 * Playwright fixture body: snapshot before the test, revert after.
 *
 * ```ts
 * export const test = base.extend<{ chainSnapshot: void }>({
 *   chainSnapshot: [chainSnapshotFixture, { auto: true }],
 * })
 * ```
 *
 * Declared `auto` so a suite opts in once rather than per test. Read the
 * caveats above first — a suite whose page is already showing state from
 * before the snapshot will see it go stale on revert.
 */
export async function chainSnapshotFixture(
  _: unknown,
  use: (value: void) => Promise<void>,
): Promise<void> {
  const id = await takeSnapshot()
  try {
    await use(undefined)
  } finally {
    await revertTo(id)
  }
}
