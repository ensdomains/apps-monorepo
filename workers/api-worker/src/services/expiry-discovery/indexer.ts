import {
  type BignameClient,
  fetchAllPages,
  isBignameError,
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
import { type ExpiryStageConfig, type ExpiryTrack, TRACKS } from './stages.js'

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
  /**
   * The row's place in the track's window, in unix seconds: the served
   * `expires_at` minus the track's shift. Pages and cursors move on it. For a
   * row in the track it is the registration's own expiry (the lease date for
   * ENSv1).
   */
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

/** The registration's own expiry: the lease date for an ENSv1 track. */
const ownExpiry = (row: NameListRow, track: ExpiryTrack) =>
  timestampToBigInt(
    track.expirySource === 'ens_v1' ? row.ens_v1?.expires_at : row.expires_at,
  )

/**
 * Whether the row is one of the track's names. The subname track's unfiltered
 * window also holds every `.eth` second-level name expiring in it.
 */
const isTrackName = (row: NameListRow, track: ExpiryTrack) =>
  isEthSecondLevelName(row.name) === (track.names === 'eth_second_level')

/**
 * Whether the row is the track's and its served `expires_at` and
 * `grace_ends_at` sit where the track expects them for the row's own expiry.
 * This is what tells a reserved ENSv1 lease (served 62 days later) from an
 * unreserved one, and drops a reserved lease whose reservation was extended
 * separately.
 */
const isInTrack = (row: NameListRow, track: ExpiryTrack, served: bigint) => {
  const own = ownExpiry(row, track)
  const graceEnd = timestampToBigInt(row.grace_ends_at)
  return (
    isTrackName(row, track) &&
    own !== undefined &&
    graceEnd !== undefined &&
    served - own === BigInt(track.servedShiftSeconds) &&
    graceEnd - own === BigInt(track.graceSeconds)
  )
}

/** Whether two tracks read the same rows: the same names and `authority`. */
const sharesSweep = (a: ExpiryTrack, b: ExpiryTrack) =>
  a.names === b.names &&
  (a.authority ?? []).join() === (b.authority ?? []).join()

/** Whether any track sweeping the same rows as `track` keeps this row. */
const isPlacedInAnyTrack = (row: NameListRow, track: ExpiryTrack): boolean => {
  const served = timestampToBigInt(row.expires_at)
  if (served === undefined) return false
  return TRACKS.filter((candidate) => sharesSweep(candidate, track)).some(
    (candidate) => isInTrack(row, candidate, served),
  )
}

const toExpiringDomain = (
  row: NameListRow,
  track: ExpiryTrack,
  served: number,
): ExpiringDomain => ({
  name: row.name,
  expiryDate: served - track.servedShiftSeconds,
  inTrack: isInTrack(row, track, BigInt(served)),
  graceEndDate: timestampToSeconds(row.grace_ends_at),
  // A released row has no owner; its last holder is kept apart (N8).
  owner: (row.owner ?? row.lapsed_registration?.owner)?.toLowerCase(),
  registrationStatus: row.registration_status,
  releaseKind: row.lapsed_registration?.release_kind,
})

/**
 * Names in one track whose own expiry is in `(cursor, upperBound]` (unix
 * seconds), ascending, at most `maxRows` (default `QUERY_PAGE_SIZE`) of them.
 * `hasMore` is true when the window holds more rows than were returned.
 *
 * Reads bigname's `GET /v1/names` expiry sweep over `.eth` second-level names
 * (`parent=eth`) with the track's `authority` or, for the subname track, over
 * every name. Its window is
 * `[expires_after, expires_before)` on the served expiry, which is whole
 * seconds, so the half-open seconds window maps to
 * `[cursor + 1 + shift, upperBound + 1 + shift)`. The client retries
 * transient failures (408/429/5xx, network, `409 stale`).
 *
 * Rows are returned whatever their status or track fit (released names are
 * listed with their lapsed expiry), including the subname track's `.eth`
 * second-level rows; callers filter per stage so page planning still sees
 * every row.
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
  const shift = ctx.track.servedShiftSeconds
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
  const expires_after = secondsToTimestamp(ctx.cursor + 1 + shift)
  const expires_before = secondsToTimestamp(ctx.upperBound + 1 + shift)

  const result = yield* fromPromise(
    fetchAllPages(
      (cursor) =>
        bigname.listNames({
          namespace: 'ens',
          parent: ctx.track.names === 'eth_second_level' ? 'eth' : undefined,
          authority: ctx.track.authority,
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
  // The ENSv1 tracks read the same rows and each keeps the ones in its step,
  // so only rows that fit no track are worth a warning. The subname track's
  // `.eth` second-level rows belong to the other tracks' sweeps.
  const unplaced = result.rows.filter(
    (row) => isTrackName(row, ctx.track) && !isPlacedInAnyTrack(row, ctx.track),
  )
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
