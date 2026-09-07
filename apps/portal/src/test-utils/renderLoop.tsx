import { render } from '@testing-library/react'
import { type ComponentType, Profiler, type ReactNode } from 'react'
import { expect } from 'vitest'

/**
 * A shared oracle for "this page is not stuck re-rendering itself".
 *
 * The defect it exists for (WEB-1411, #1141): a route that hands `useReactTable`
 * a fresh `data` array on every render invalidates the table's row-model memos,
 * each of which calls `_autoResetPageIndex()` on recompute. That queues a
 * pagination write, which re-renders the route, which builds another fresh
 * array — a cycle that never settles. At rest it burns CPU through React's
 * scheduler; re-entered from a real click the updates land on the sync lane
 * inside one microtask checkpoint and the tab wedges outright, with no console
 * error to show for it.
 *
 * Counting a specific function's calls pins one known cause. Counting *commits*
 * pins the property we actually care about — the page stops rendering — so it
 * holds whatever the next unstable reference turns out to be.
 */

/** A fixed window in which a running render loop would show itself. */
const SETTLE_MS = 200

const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS))

/**
 * `commits` only ever moves when the `Profiler` reports, so a Profiler that
 * stopped firing — a wrapper refactor, a build where `onRender` is a no-op —
 * would leave it at 0 and sail through both halves of the oracle below. Every
 * caller structurally commits at least twice: the mount, and the render that
 * arms the loop.
 */
export const MIN_SETTLED_COMMITS = 2

export type CommitCounter = {
  /** Commits the subject has reported so far. */
  readonly commitCount: () => number
  /**
   * Render the subject again from the outside.
   *
   * TanStack Table's `_autoResetPageIndex` only registers itself on its first
   * call, so the loop cannot start until the subject has rendered a second time
   * with a fresh `data` array. Drive that render explicitly rather than leaning
   * on whatever incidental churn the providers happen to produce, otherwise a
   * test can go green against unfixed code for the wrong reason.
   */
  readonly rerenderSubject: () => void
}

/**
 * Mount `subject` under a `Profiler` that counts commits, and expose a way to
 * force another render of it. `subject` is a thunk because each render has to
 * build a fresh element for the same Profiler.
 */
export const renderWithCommitCounter = (
  subject: () => ReactNode,
  { wrapper }: { wrapper?: ComponentType<{ children: ReactNode }> } = {},
): CommitCounter => {
  let commits = 0

  const tree = () => (
    <Profiler
      id="render-loop-subject"
      onRender={() => {
        commits += 1
      }}
    >
      {subject()}
    </Profiler>
  )

  const { rerender } = render(tree(), { wrapper })

  return {
    commitCount: () => commits,
    rerenderSubject: () => {
      rerender(tree())
    },
  }
}

/**
 * The oracle: after one quiet window the subject has committed only its mount
 * and arming renders, and a second quiet window adds none at all. A subject
 * stuck in the WEB-1411 loop fails both halves — it blows the bound and keeps
 * climbing.
 *
 * `maxSettledCommits` is per call site: legitimate render costs differ between
 * a page that only mounts and one that also carries a pointer sequence. Pick it
 * well clear of the settled count and well below the unfixed count, and record
 * both measurements where you pass it.
 */
export const expectSettled = async (
  { commitCount }: Pick<CommitCounter, 'commitCount'>,
  maxSettledCommits: number,
) => {
  await settle()

  const settledCommits = commitCount()
  expect(settledCommits).toBeGreaterThanOrEqual(MIN_SETTLED_COMMITS)
  expect(settledCommits).toBeLessThan(maxSettledCommits)

  await settle()
  expect(commitCount()).toBe(settledCommits)
}
