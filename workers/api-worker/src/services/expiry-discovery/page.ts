import { ResultFn } from '@ens-apps/utils/neverthrow'
import { ok } from 'neverthrow'
import type { ExpiryStageId } from '#types/events/index.js'
import {
  type ExpiringName,
  type ExpiringNamesPage,
  type ExpiryInterval,
  fetchExpiringNamesPage,
  MAX_WINDOWS_PER_READ,
  PAGE_SIZE,
} from './indexer.js'
import { type ExpiryStageConfig, isNotifiableAtStage } from './stages.js'

// Pages one walk reads in a run.
export const MAX_PAGES_PER_READ = 10
export const MAX_NAMES_PER_READ = PAGE_SIZE * MAX_PAGES_PER_READ

export type ExpiryTimestampOverflow = {
  readonly expiryTimestamp: number
  readonly processedCount: number
}

export type ProcessableExpiryPage = {
  readonly domains: readonly ExpiringName[]
  readonly cursorEnd: number
  readonly hasMore: boolean
  readonly overflow?: ExpiryTimestampOverflow
}

/** The part of a stage's timeline this run reads: (cursor, upperBound]. */
export type StageWindow = {
  readonly stage: ExpiryStageConfig
  readonly cursor: number
  readonly upperBound: number
}

/** Overlapping or touching windows become one interval, (from, to]. */
export const mergeWindows = (
  windows: readonly StageWindow[],
): readonly ExpiryInterval[] => {
  let merged: readonly ExpiryInterval[] = []
  for (const window of windows.toSorted(
    (left, right) => left.cursor - right.cursor,
  )) {
    const last = merged.at(-1)
    merged =
      last && window.cursor <= last.to
        ? [
            ...merged.slice(0, -1),
            { from: last.from, to: Math.max(last.to, window.upperBound) },
          ]
        : [...merged, { from: window.cursor, to: window.upperBound }]
  }
  return merged
}

type WindowsRead = {
  readonly intervals: readonly ExpiryInterval[]
  readonly rows: readonly ExpiringName[]
  readonly isComplete: boolean
  /** Expiry of the last row read; the first interval's start when none was. */
  readonly lastReadPosition: number
  readonly indexedAtSec: number
}

/** One sorted walk over up to 32 disjoint intervals of the served expiry. */
const readIntervals = ResultFn(async function* (ctx: {
  readonly env: CloudflareBindings
  readonly intervals: readonly ExpiryInterval[]
}) {
  let rows: readonly ExpiringName[] = []
  let indexedAtSec = Number.POSITIVE_INFINITY
  let lastReadPosition = ctx.intervals[0]?.from ?? 0
  let pageCursor: string | null = null
  for (let read = 0; read < MAX_PAGES_PER_READ; read++) {
    const page: ExpiringNamesPage = yield* fetchExpiringNamesPage({
      env: ctx.env,
      label: 'the expiry sweep',
      windows: ctx.intervals.map(({ from, to }) => ({ from: from + 1, to })),
      ...(pageCursor !== null && { pageCursor }),
    })
    rows = [...rows, ...page.names]
    lastReadPosition = page.names.at(-1)?.expiryDate ?? lastReadPosition
    indexedAtSec = Math.min(indexedAtSec, page.indexedAtSec)
    pageCursor = page.nextCursor
    if (pageCursor === null) break
  }
  return ok<WindowsRead>({
    intervals: ctx.intervals,
    rows,
    isComplete: pageCursor === null,
    lastReadPosition,
    indexedAtSec,
  })
})

/**
 * One stage's share of the sweep.
 *
 * A walk that ran out of pages inside the window stops the cursor just before
 * the second it was reading, so that second is read whole next run; reminders
 * are idempotent, so the overlap is harmless. Only when one second alone fills
 * the page budget does the stage move past it and report it. After a complete
 * read the cursor moves to the window's end: windows never pass the time the
 * index has reached, so nothing earlier can still appear.
 */
const pageForWindow = (
  window: StageWindow,
  read: WindowsRead,
): ProcessableExpiryPage => {
  const isWanted = (name: ExpiringName) =>
    isNotifiableAtStage(window.stage, name)
  const seen = read.rows.filter(
    ({ expiryDate }) =>
      expiryDate > window.cursor && expiryDate <= window.upperBound,
  )

  if (read.isComplete || read.lastReadPosition > window.upperBound) {
    return {
      domains: seen.filter(isWanted),
      cursorEnd: window.upperBound,
      hasMore: false,
    }
  }

  const stopAt = read.lastReadPosition
  if (stopAt <= window.cursor) {
    return { domains: [], cursorEnd: window.cursor, hasMore: true }
  }
  if (stopAt - 1 > window.cursor) {
    return {
      domains: seen.filter(
        (name) => name.expiryDate < stopAt && isWanted(name),
      ),
      cursorEnd: stopAt - 1,
      hasMore: true,
    }
  }
  const domains = seen.filter(
    (name) => name.expiryDate <= stopAt && isWanted(name),
  )
  return {
    domains,
    cursorEnd: stopAt,
    hasMore: true,
    overflow: { expiryTimestamp: stopAt, processedCount: domains.length },
  }
}

export type ExpirySweep = {
  readonly pages: ReadonlyMap<ExpiryStageId, ProcessableExpiryPage>
  /** The oldest chain time any page belonged to. */
  readonly indexedAtSec: number
}

const chunkIntervals = (
  intervals: readonly ExpiryInterval[],
): readonly (readonly ExpiryInterval[])[] =>
  Array.from(
    { length: Math.ceil(intervals.length / MAX_WINDOWS_PER_READ) },
    (_, index) =>
      intervals.slice(
        index * MAX_WINDOWS_PER_READ,
        (index + 1) * MAX_WINDOWS_PER_READ,
      ),
  )

/**
 * Reads every open stage window in one multi-window walk: windows that
 * overlap or touch become one interval, and the rows are split by stage.
 * Every `.eth` name is placed by its served expiry, as the windows are.
 * The windows must already end at or before the time the index has reached.
 */
export const fetchSweep = ResultFn(async function* (ctx: {
  readonly env: CloudflareBindings
  readonly windows: readonly StageWindow[]
}) {
  let reads: readonly WindowsRead[] = []
  for (const intervals of chunkIntervals(mergeWindows(ctx.windows))) {
    const read = yield* readIntervals({ env: ctx.env, intervals })
    reads = [...reads, read]
  }

  const pages = new Map(
    ctx.windows.flatMap((window) => {
      const read = reads.find((candidate) =>
        candidate.intervals.some(
          ({ from, to }) => from <= window.cursor && window.upperBound <= to,
        ),
      )
      return read
        ? [[window.stage.id, pageForWindow(window, read)] as const]
        : []
    }),
  )
  return ok<ExpirySweep>({
    pages,
    indexedAtSec: Math.min(...reads.map((read) => read.indexedAtSec)),
  })
})
