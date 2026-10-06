import type { Authority } from '@ens-apps/indexer/bigname'
import type { GraceProtocol } from '@ens-apps/utils/gracePeriod'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { errAsync, ok } from 'neverthrow'
import {
  type ExpiringName,
  type ExpiringNamesPage,
  fetchExpiringNamesPage,
  isStaleCursorError,
  PAGE_SIZE,
} from './indexer.js'
import { type ExpiryStageConfig, GRACE_END_SHIFT_SECONDS } from './stages.js'

// Pages read per source in one run, the 1,000 names a Panoptes query allowed.
export const MAX_PAGES_PER_SOURCE = 5
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
  /** The chain time the index had reached when it answered. */
  readonly indexedAtSec: number
}

type Source = {
  readonly authorities?: readonly Authority[]
  readonly shiftSec: number
}

const ENSV1_AUTHORITIES: readonly Authority[] = ['ens_v0', 'ens_v1']

const SOURCES_BY_PROTOCOL: Readonly<Record<GraceProtocol, Source>> = {
  v2: { authorities: ['ens_v2'], shiftSec: GRACE_END_SHIFT_SECONDS.v2 },
  v1: { authorities: ENSV1_AUTHORITIES, shiftSec: GRACE_END_SHIFT_SECONDS.v1 },
}

/**
 * Expiry stages read every authority at its registrar expiry. bigname cannot
 * filter on the grace end, so grace-end stages read each protocol over the
 * expiry window that maps onto the stage window.
 */
export const sourcesForStage = (stage: ExpiryStageConfig): readonly Source[] =>
  stage.anchor === 'expiry'
    ? [{ shiftSec: 0 }]
    : [SOURCES_BY_PROTOCOL.v2, SOURCES_BY_PROTOCOL.v1]

type SourceRead = {
  readonly names: readonly StageName[]
  readonly isComplete: boolean
  readonly indexedAtSec: number
}

const readSource = ResultFn(async function* (ctx: {
  readonly env: CloudflareBindings
  readonly stage: ExpiryStageConfig
  readonly source: Source
  readonly cursor: number
  readonly upperBound: number
}) {
  let names: readonly StageName[] = []
  let indexedAtSec = Number.POSITIVE_INFINITY
  let pageCursor: string | null = null
  for (let read = 0; read < MAX_PAGES_PER_SOURCE; read++) {
    const page: ExpiringNamesPage = yield* fetchExpiringNamesPage({
      env: ctx.env,
      stageId: ctx.stage.id,
      expiresFrom: ctx.cursor + 1 - ctx.source.shiftSec,
      expiresTo: ctx.upperBound - ctx.source.shiftSec,
      ...(ctx.source.authorities && { authorities: ctx.source.authorities }),
      ...(pageCursor !== null && { pageCursor }),
    })
    names = [
      ...names,
      ...page.names.map((name) => ({
        ...name,
        position: name.expiryDate + ctx.source.shiftSec,
      })),
    ]
    indexedAtSec = Math.min(indexedAtSec, page.indexedAtSec)
    pageCursor = page.nextCursor
    if (pageCursor === null) break
  }
  return ok({
    names,
    isComplete: pageCursor === null,
    indexedAtSec,
  } satisfies SourceRead)
})

const lastPosition = (read: SourceRead): number =>
  read.names.at(-1)?.position ?? Number.POSITIVE_INFINITY

/**
 * Reads every name a stage owes a reminder for in (cursor, upperBound].
 *
 * A source that runs out of pages stops the cursor just before the second it
 * was reading, so that second is read whole next run; reminders are idempotent,
 * so the overlap is harmless. Only when one second alone fills the page budget
 * does the stage move past it and report the overflow.
 */
export const fetchStageNames = ResultFn(async function* (ctx: {
  readonly env: CloudflareBindings
  readonly stage: ExpiryStageConfig
  readonly cursor: number
  readonly upperBound: number
}) {
  let reads: readonly SourceRead[] = []
  for (const source of sourcesForStage(ctx.stage)) {
    const sourceCtx = { ...ctx, source }
    // A cursor that went stale mid-read is re-read once from the first page.
    const read = yield* readSource(sourceCtx).orElse((error) =>
      isStaleCursorError(error) ? readSource(sourceCtx) : errAsync(error),
    )
    reads = [...reads, read]
  }

  const indexedAtSec = Math.min(...reads.map((read) => read.indexedAtSec))
  const all = reads
    .flatMap((read) => read.names)
    .toSorted((left, right) => left.position - right.position)
  const truncated = reads.filter((read) => !read.isComplete)

  if (truncated.length === 0) {
    // Only as far as the last name seen: a name the index records late, with
    // an expiry past that point, is still found next run.
    return ok<ProcessableExpiryPage>({
      domains: all,
      cursorEnd: all.at(-1)?.position ?? ctx.cursor,
      hasMore: false,
      indexedAtSec,
    })
  }

  const stopAt = Math.min(...truncated.map(lastPosition))
  if (stopAt - 1 > ctx.cursor) {
    return ok<ProcessableExpiryPage>({
      domains: all.filter((name) => name.position < stopAt),
      cursorEnd: stopAt - 1,
      hasMore: true,
      indexedAtSec,
    })
  }

  const read = all.filter((name) => name.position <= stopAt)
  return ok<ProcessableExpiryPage>({
    domains: read,
    cursorEnd: stopAt,
    hasMore: true,
    overflow: { expiryTimestamp: stopAt, processedCount: read.length },
    indexedAtSec,
  })
})
