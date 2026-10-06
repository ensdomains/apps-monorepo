import {
  type BignameClient,
  fetchAllPages,
  isBignameError,
  iteratePages,
  MAX_PAGE_SIZE,
  type Meta,
  type NameListRow,
  type RegistrationStatus,
  secondsToTimestamp,
  timestampToBigInt,
  timestampToSeconds,
} from '@ens-apps/bigname'
import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok, type Result } from 'neverthrow'
import { createBigname } from '#core/bigname/index.js'
import { isEthSecondLevelName } from '#utils/ensName.js'
import { logger } from '#utils/logger.js'
import type { ExpiryStageConfig, ExpiryTrack } from './stages.js'

export const PROCESS_PAGE_SIZE = 999
/** Rows read per window query: one processable page plus one lookahead row. */
export const QUERY_PAGE_SIZE = PROCESS_PAGE_SIZE + 1
/**
 * Rows read when a page boundary splits one expiry timestamp. bigname breaks
 * expiry ties by name, so the cursor can continue inside one timestamp; this
 * only bounds the work (and subrequests) a single bucket can take.
 */
export const EXACT_TIMESTAMP_MAX_ROWS = 5_000

/** Names logged per window that fit no track; the count is always logged. */
const UNPLACED_LOG_LIMIT = 20

class IndexerRequestError extends TaggedError('INDEXER_REQUEST_ERROR')<{
  status?: number
}> {}

class IndexerValidationError extends TaggedError('INDEXER_VALIDATION_ERROR') {}

class IndexerConfigError extends TaggedError('INDEXER_CONFIG_ERROR')<{
  cause: unknown
}> {}

/**
 * Building the client resolves the network from the bindings, which can fail
 * (an absent or unknown `CHAIN`, no bigname URL for it). Returning a Result
 * keeps that inside the caller's error channel instead of rejecting the
 * generator, which would bypass the cron's failure handling.
 */
function getBigname(
  env: CloudflareBindings,
): Result<BignameClient, IndexerConfigError> {
  return fromSync(
    () => createBigname(env),
    (error) => new IndexerConfigError({ cause: error }),
  )
}

export type ExpiringDomain = {
  name: string
  /** Served expiry, used by both reminders and pagination cursors. */
  expiryDate: number
  /**
   * Whether the row is one of the track's names and its dates are where the
   * track expects them. Other rows only move the window.
   */
  inTrack: boolean
  /** End of the renewal grace (`grace_ends_at`), unix seconds. */
  graceEndDate?: number
  /** Who to notify: the holder, or the last holder of a released registration. */
  owner?: string
  registrationStatus: RegistrationStatus
  releaseKind?: 'expired' | 'unregistered'
}

/** Only direct .eth names with the post-cutover registrar grace qualify. */
const isInTrack = (row: NameListRow, track: ExpiryTrack, served: bigint) => {
  const graceEnd = timestampToBigInt(row.grace_ends_at)
  return (
    isEthSecondLevelName(row.name) &&
    graceEnd !== undefined &&
    graceEnd - served === BigInt(track.graceSeconds)
  )
}

const toExpiringDomain = (
  row: NameListRow,
  track: ExpiryTrack,
  served: number,
): ExpiringDomain => ({
  name: row.name,
  expiryDate: served,
  inTrack: isInTrack(row, track, BigInt(served)),
  graceEndDate: timestampToSeconds(row.grace_ends_at),
  // A released row has no owner; its last holder is kept apart (N8).
  owner: (row.owner ?? row.lapsed_registration?.owner)?.toLowerCase(),
  registrationStatus: row.registration_status,
  releaseKind: row.lapsed_registration?.release_kind,
})

/**
 * Direct .eth names in `(cursor, upperBound]`, ordered by served expiry.
 * BigName's half-open bounds are `[cursor + 1, upperBound + 1)`.
 * Keep non-notifiable rows for pagination; stage processing filters them.
 */
export const fetchExpiringNamesPage = ResultFn(async function* (ctx: {
  env: CloudflareBindings
  track: ExpiryTrack
  stage: ExpiryStageConfig
  cursor: number
  upperBound: number
  maxRows?: number
}) {
  const maxRows = ctx.maxRows ?? QUERY_PAGE_SIZE
  logger.trace('Fetching expiring names page from bigname', {
    trackId: ctx.track.id,
    stageId: ctx.stage.id,
    cursor: ctx.cursor,
    upperBound: ctx.upperBound,
  })

  // bigname rejects an empty or inverted window.
  if (ctx.cursor >= ctx.upperBound) {
    return ok({ domains: [] as ExpiringDomain[], hasMore: false })
  }

  const bigname = yield* getBigname(ctx.env)
  const expires_after = secondsToTimestamp(ctx.cursor + 1)
  const expires_before = secondsToTimestamp(ctx.upperBound + 1)

  const result = yield* fromPromise(
    fetchAllPages(
      (cursor) =>
        bigname.listNames({
          namespace: 'ens',
          parent: 'eth',
          expires_after,
          expires_before,
          sort: 'expires_at',
          order: 'asc',
          page_size: MAX_PAGE_SIZE,
          cursor,
        }),
      { maxRows, maxPages: Math.ceil(maxRows / MAX_PAGE_SIZE) },
    ),
    (error) =>
      new IndexerRequestError({
        message: `bigname expiry query failed for ${ctx.track.id} stage ${ctx.stage.id}`,
        cause: error,
        status: isBignameError(error) ? error.status : undefined,
      }),
  )

  const domains: ExpiringDomain[] = []
  for (const row of result.rows) {
    const served = timestampToSeconds(row.expires_at)
    if (served === undefined) {
      logger.warn('bigname expiry row validation failed', {
        trackId: ctx.track.id,
        stage: ctx.stage.id,
        name: row.name,
        expiresAt: row.expires_at,
      })
      return yield* new IndexerValidationError({
        message: `bigname expiry row without a valid expires_at for ${ctx.track.id} stage ${ctx.stage.id}`,
      })
    }
    domains.push(toExpiringDomain(row, ctx.track, served))
  }

  const notInTrack = domains.filter((domain) => !domain.inTrack)
  logger.debug('bigname expiry query succeeded', {
    trackId: ctx.track.id,
    stageId: ctx.stage.id,
    domainCount: domains.length,
    notInTrackCount: notInTrack.length,
    firstExpiryDate: domains[0]?.expiryDate,
    lastExpiryDate: domains.at(-1)?.expiryDate,
    hasMore: result.truncated,
  })
  const unplaced = domains.filter((domain) => !domain.inTrack)
  if (unplaced.length > 0) {
    logger.warn('bigname expiry rows fit no expiry track; not notified', {
      trackId: ctx.track.id,
      stageId: ctx.stage.id,
      count: unplaced.length,
      names: unplaced.slice(0, UNPLACED_LOG_LIMIT).map((row) => row.name),
    })
  }

  return ok({ domains, hasMore: result.truncated })
})

/**
 * The time of the publication bigname serves (`meta.as_of`, the smallest
 * timestamp when it lists several chains), in unix seconds. Stage windows
 * are placed against it rather than the wall clock, so a row is only judged
 * once the indexed state has reached its phase (expiry-sweep guide,
 * "Freshness").
 */
export const fetchPublicationTime = ResultFn(async function* (ctx: {
  env: CloudflareBindings
  nowSec: number
}) {
  const bigname = yield* getBigname(ctx.env)
  const response = yield* fromPromise(
    bigname.listNames({
      namespace: 'ens',
      parent: 'eth',
      expires_after: secondsToTimestamp(ctx.nowSec),
      page_size: 1,
    }),
    (error) =>
      new IndexerRequestError({
        message: 'bigname publication time query failed',
        cause: error,
        status: isBignameError(error) ? error.status : undefined,
      }),
  )

  const publicationTime = smallestAsOfSeconds(response.meta)
  if (publicationTime === undefined) {
    return yield* new IndexerValidationError({
      message: 'bigname page without a meta.as_of timestamp',
    })
  }
  return ok(publicationTime)
})

const smallestAsOfSeconds = (meta: Meta): number | undefined => {
  const seconds = Object.values(meta.as_of ?? {})
    .map((position) => timestampToSeconds(position.timestamp))
    .filter((value): value is number => value !== undefined)
  return seconds.length === 0 ? undefined : Math.min(...seconds)
}

export type ExpiryWindow = {
  stage: ExpiryStageConfig
  cursor: number
  upperBound: number
}

export type ExpiringNamesPage = {
  domains: ExpiringDomain[]
  hasMore: boolean
}

type WindowReadState = {
  rows: Map<string, NameListRow[]>
  currentWindowIndex: number
  cappedIndex?: number
}

const createWindowReadState = (
  windows: readonly ExpiryWindow[],
): WindowReadState => ({
  rows: new Map(windows.map((window) => [window.stage.id, []])),
  currentWindowIndex: 0,
})

function collectWindowRows(
  state: WindowReadState,
  windows: readonly ExpiryWindow[],
  rows: readonly NameListRow[],
) {
  for (const row of rows) {
    const index = row.expires_window_index
    const window = index === undefined ? undefined : windows[index]
    if (index === undefined || !window || !Number.isInteger(index)) {
      throw new IndexerValidationError({
        message: 'bigname expiry row without a valid expires_window_index',
      })
    }
    state.currentWindowIndex = index
    const bucket = state.rows.get(window.stage.id) ?? []
    bucket.push(row)
    if (bucket.length >= QUERY_PAGE_SIZE) state.cappedIndex = index
  }
}

/** A page cannot overfill any band, or consume later bands after a cap. */
const windowPageSize = (
  state: WindowReadState,
  windows: readonly ExpiryWindow[],
) =>
  Math.min(
    MAX_PAGE_SIZE,
    ...windows
      .slice(state.currentWindowIndex)
      .map(
        (window) =>
          QUERY_PAGE_SIZE - (state.rows.get(window.stage.id)?.length ?? 0),
      ),
  )

/** Keep this request's window order stable for every continuation. */
async function readWindowBatch(
  bigname: BignameClient,
  windows: readonly ExpiryWindow[],
) {
  let state = createWindowReadState(windows)
  const expires_window = windows.map(
    (window) =>
      `${secondsToTimestamp(window.cursor + 1)}..${secondsToTimestamp(window.upperBound + 1)}`,
  )
  let exhausted = false
  for await (const response of iteratePages(
    (cursor) =>
      bigname.listNames({
        namespace: 'ens',
        parent: 'eth',
        expires_window,
        sort: 'expires_at',
        order: 'asc',
        page_size: windowPageSize(state, windows),
        cursor,
      }),
    {
      maxPages:
        windows.length * (Math.ceil(QUERY_PAGE_SIZE / MAX_PAGE_SIZE) + 1),
    },
  )) {
    if (response.restarted) state = createWindowReadState(windows)
    collectWindowRows(state, windows, response.data)
    exhausted = !response.page.has_more
    if (state.cappedIndex !== undefined || exhausted) break
  }
  if (!exhausted && state.cappedIndex === undefined) {
    throw new IndexerValidationError({
      message: 'bigname expiry window walk ended before completion',
    })
  }
  return {
    rows: state.rows,
    finishedCount: exhausted ? windows.length : (state.cappedIndex ?? -1) + 1,
    exhausted,
  }
}

function toWindowPage(
  rows: readonly NameListRow[],
  track: ExpiryTrack,
  window: ExpiryWindow,
  hasMore: boolean,
): ExpiringNamesPage {
  const domains = rows.map((row) => {
    const served = timestampToSeconds(row.expires_at)
    if (served === undefined) {
      throw new IndexerValidationError({
        message: 'bigname expiry row without a valid expires_at',
      })
    }
    return toExpiringDomain(row, track, served)
  })
  const unplaced = domains.filter((domain) => !domain.inTrack)
  if (unplaced.length > 0) {
    logger.warn('bigname expiry rows fit no expiry track; not notified', {
      trackId: track.id,
      stageId: window.stage.id,
      count: unplaced.length,
      names: unplaced.slice(0, UNPLACED_LOG_LIMIT).map((row) => row.name),
    })
  }
  return { domains, hasMore }
}

async function readExpiringWindows(
  bigname: BignameClient,
  track: ExpiryTrack,
  windows: readonly ExpiryWindow[],
) {
  const pages = new Map<string, ExpiringNamesPage>()
  let pending = windows
  while (pending.length > 0) {
    const batch = await readWindowBatch(bigname, pending)
    for (const window of pending.slice(0, batch.finishedCount)) {
      pages.set(
        window.stage.id,
        toWindowPage(
          batch.rows.get(window.stage.id) ?? [],
          track,
          window,
          !batch.exhausted && window === pending[batch.finishedCount - 1],
        ),
      )
    }
    // Dropping completed/capped bands changes the query, so the next batch
    // starts a fresh cursor and cannot starve behind a dense earlier band.
    pending = pending.slice(batch.finishedCount)
  }
  return pages
}

/**
 * Sweep all open stages of one track together. Stage windows are disjoint.
 * Keep each stage's 1,000-row budget: when a dense stage fills it, start a
 * new request for the later windows, so that stage cannot starve the rest.
 * Changing the window list starts a new cursor; continuations retain the
 * exact original list/order. Each stage still plans its own timestamp-safe
 * checkpoint and exact-second recovery after this read.
 */
export const fetchExpiringNamesPages = ResultFn(async function* (ctx: {
  env: CloudflareBindings
  track: ExpiryTrack
  windows: readonly ExpiryWindow[]
}) {
  const windows = ctx.windows
    .filter((window) => window.cursor < window.upperBound)
    .toSorted((a, b) => a.cursor - b.cursor)
  if (windows.length === 0) return ok(new Map<string, ExpiringNamesPage>())
  const bigname = yield* getBigname(ctx.env)
  const result = yield* fromPromise(
    readExpiringWindows(bigname, ctx.track, windows),
    (error) =>
      error instanceof IndexerValidationError
        ? error
        : new IndexerRequestError({
            message: `bigname expiry windows query failed for ${ctx.track.id}`,
            cause: error,
            status: isBignameError(error) ? error.status : undefined,
          }),
  )
  return ok(result)
})
