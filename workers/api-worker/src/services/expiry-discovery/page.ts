import type { Authority } from '@ens-apps/indexer/bigname'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { ok } from 'neverthrow'
import type { ExpiryStageId } from '#types/events/index.js'
import {
  type ExpiringName,
  type ExpiringNamesPage,
  fetchExpiringNamesPage,
  PAGE_SIZE,
} from './indexer.js'
import { type ExpiryStageConfig, GRACE_END_SHIFT_SECONDS } from './stages.js'

// Pages read per source in one run.
export const MAX_PAGES_PER_SOURCE = 10
export const MAX_NAMES_PER_SOURCE = PAGE_SIZE * MAX_PAGES_PER_SOURCE

/** A name placed on its stage's timeline. */
export type StageName = ExpiringName & {
  /** Where the stage cursor treats this name as sitting. */
  readonly position: number
}

export type ExpiryTimestampOverflow = {
  readonly expiryTimestamp: number
  readonly processedCount: number
}

export type ProcessableExpiryPage = {
  readonly domains: readonly StageName[]
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

type Source = {
  readonly key:
    | 'expiry'
    | 'expiry-v1-reserved'
    | 'grace-end'
    | 'grace-end-v1-unreserved'
  readonly anchor: ExpiryStageConfig['anchor']
  readonly authorities?: readonly Authority[]
  /** A row sits this far after its served `expires_at` on the stage timeline. */
  readonly listingShiftSec: number
}

// A reserved ENSv1 name is listed by its ENSv2 reservation, which normally
// ends this long after the lease so that both graces end together.
const RESERVATION_SHIFT_SECONDS = GRACE_END_SHIFT_SECONDS.v1
const V1_AUTHORITIES = [
  'ens_v0',
  'ens_v1',
] as const satisfies readonly Authority[]

const SOURCES = {
  // ENSv2 names, and ENSv1 names listed by their lease.
  expiry: { key: 'expiry', anchor: 'expiry', listingShiftSec: 0 },
  'expiry-v1-reserved': {
    key: 'expiry-v1-reserved',
    anchor: 'expiry',
    authorities: V1_AUTHORITIES,
    listingShiftSec: -RESERVATION_SHIFT_SECONDS,
  },
  // ENSv2 names, and reserved ENSv1 names, whose listing date is their grace end
  // in ENSv2 terms.
  'grace-end': { key: 'grace-end', anchor: 'grace-end', listingShiftSec: 0 },
  'grace-end-v1-unreserved': {
    key: 'grace-end-v1-unreserved',
    anchor: 'grace-end',
    authorities: V1_AUTHORITIES,
    listingShiftSec: RESERVATION_SHIFT_SECONDS,
  },
} as const satisfies Record<Source['key'], Source>

/**
 * bigname windows on the served `expires_at`, which for a reserved ENSv1 name
 * is its reservation rather than its lease. Each anchor reads the stage window
 * once as served and once shifted by the reservation, then places every row by
 * its own lease.
 */
export const sourcesForStage = (stage: ExpiryStageConfig): readonly Source[] =>
  stage.anchor === 'expiry'
    ? [SOURCES.expiry, SOURCES['expiry-v1-reserved']]
    : [SOURCES['grace-end'], SOURCES['grace-end-v1-unreserved']]

/** Where a name sits on a stage timeline, from its lease or ENSv2 expiry. */
export const stagePosition = (
  name: ExpiringName,
  anchor: ExpiryStageConfig['anchor'],
): number =>
  anchor === 'expiry'
    ? name.expiryDate
    : name.expiryDate + GRACE_END_SHIFT_SECONDS[name.protocol]

/** A stretch of one stage timeline, (from, to]. */
type Interval = {
  readonly from: number
  readonly to: number
}

/** Overlapping or touching windows become one read. */
export const mergeWindows = (
  windows: readonly StageWindow[],
): readonly Interval[] => {
  let merged: readonly Interval[] = []
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

type SourceRead = Interval & {
  readonly source: Source
  /** Every row read, released ones included. */
  readonly rows: readonly StageName[]
  readonly isComplete: boolean
  /** Position of the last row read; `from` when nothing was read. */
  readonly lastReadPosition: number
  readonly indexedAtSec: number
}

const readSource = ResultFn(async function* (ctx: {
  readonly env: CloudflareBindings
  readonly source: Source
  readonly from: number
  readonly to: number
}) {
  let rows: readonly StageName[] = []
  let indexedAtSec = Number.POSITIVE_INFINITY
  let lastReadPosition = ctx.from
  let pageCursor: string | null = null
  for (let read = 0; read < MAX_PAGES_PER_SOURCE; read++) {
    const page: ExpiringNamesPage = yield* fetchExpiringNamesPage({
      env: ctx.env,
      label: `the ${ctx.source.key} expiry sweep`,
      expiresFrom: ctx.from + 1 - ctx.source.listingShiftSec,
      expiresTo: ctx.to - ctx.source.listingShiftSec,
      ...(ctx.source.authorities && { authorities: ctx.source.authorities }),
      ...(pageCursor !== null && { pageCursor }),
    })
    const placed = page.names.map((name) => ({
      ...name,
      position: stagePosition(name, ctx.source.anchor),
    }))
    rows = [...rows, ...placed]
    // The walk is ordered by listing date, so that is how far it got.
    const lastListedAt = page.names.at(-1)?.listedAt
    lastReadPosition =
      lastListedAt === undefined
        ? lastReadPosition
        : lastListedAt + ctx.source.listingShiftSec
    indexedAtSec = Math.min(indexedAtSec, page.indexedAtSec)
    pageCursor = page.nextCursor
    if (pageCursor === null) break
  }
  return ok<SourceRead>({
    source: ctx.source,
    from: ctx.from,
    to: ctx.to,
    rows,
    isComplete: pageCursor === null,
    lastReadPosition,
    indexedAtSec,
  })
})

/**
 * One stage's share of the sweep.
 *
 * A source that ran out of pages inside the window stops the cursor just
 * before the second it was reading, so that second is read whole next run;
 * reminders are idempotent, so the overlap is harmless. Only when one second
 * alone fills the page budget does the stage move past it and report it.
 * After a complete read the cursor moves to the window's end: windows never
 * pass the time the index has reached, so nothing earlier can still appear.
 */
const pageForWindow = (
  window: StageWindow,
  reads: readonly SourceRead[],
): ProcessableExpiryPage => {
  const isWanted = (name: StageName) =>
    window.stage.includeReleased || !name.isReleased
  const seen = reads
    .flatMap((read) => read.rows)
    .filter(
      (row, index, rows) =>
        rows.findIndex((other) => other.name === row.name) === index,
    )
    .filter(
      ({ position }) =>
        position > window.cursor && position <= window.upperBound,
    )
    .toSorted((left, right) => left.position - right.position)
  const stops = reads
    .filter(
      (read) => !read.isComplete && read.lastReadPosition <= window.upperBound,
    )
    .map((read) => read.lastReadPosition)

  if (stops.length === 0) {
    return {
      domains: seen.filter(isWanted),
      cursorEnd: window.upperBound,
      hasMore: false,
    }
  }

  const stopAt = Math.min(...stops)
  if (stopAt <= window.cursor) {
    return { domains: [], cursorEnd: window.cursor, hasMore: true }
  }
  if (stopAt - 1 > window.cursor) {
    return {
      domains: seen.filter((name) => name.position < stopAt && isWanted(name)),
      cursorEnd: stopAt - 1,
      hasMore: true,
    }
  }
  const domains = seen.filter(
    (name) => name.position <= stopAt && isWanted(name),
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

/**
 * Reads every open stage window, once per source and merged stretch: windows
 * that overlap or touch are read together, and the rows are split by stage.
 * The windows must already end at or before the time the index has reached.
 */
export const fetchSweep = ResultFn(async function* (ctx: {
  readonly env: CloudflareBindings
  readonly windows: readonly StageWindow[]
}) {
  const usesSource = (window: StageWindow, key: Source['key']) =>
    sourcesForStage(window.stage).some((source) => source.key === key)
  const keys = [
    ...new Set(
      ctx.windows.flatMap((window) =>
        sourcesForStage(window.stage).map(({ key }) => key),
      ),
    ),
  ]

  let reads: readonly SourceRead[] = []
  for (const key of keys) {
    const windows = ctx.windows.filter((window) => usesSource(window, key))
    for (const interval of mergeWindows(windows)) {
      const read = yield* readSource({
        env: ctx.env,
        source: SOURCES[key],
        ...interval,
      })
      reads = [...reads, read]
    }
  }

  const pages = new Map(
    ctx.windows.map((window) => {
      const windowReads = reads.filter(
        (read) =>
          usesSource(window, read.source.key) &&
          read.from <= window.cursor &&
          window.upperBound <= read.to,
      )
      return [window.stage.id, pageForWindow(window, windowReads)] as const
    }),
  )
  return ok<ExpirySweep>({
    pages,
    indexedAtSec: Math.min(...reads.map((read) => read.indexedAtSec)),
  })
})
