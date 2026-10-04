import {
  type BignameClient,
  fetchAllPages,
  isBignameError,
  MAX_PAGE_SIZE,
  type RegistrationStatus,
  secondsToTimestamp,
  timestampToSeconds,
} from '@ens-apps/bigname'
import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok, type Result } from 'neverthrow'
import { createBigname } from '#core/bigname/index.js'
import { logger } from '#utils/logger.js'
import type { ExpiryStageConfig } from './stages.js'

export const PROCESS_PAGE_SIZE = 999
/** Rows read per window query: one processable page plus one lookahead row. */
export const QUERY_PAGE_SIZE = PROCESS_PAGE_SIZE + 1
/**
 * Rows read when a page boundary splits one expiry timestamp. bigname breaks
 * expiry ties by name, so the cursor can continue inside one timestamp; this
 * only bounds the work (and subrequests) a single bucket can take.
 */
export const EXACT_TIMESTAMP_MAX_ROWS = 5_000

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
  expiryDate: number
  owner?: string
  registrationStatus?: RegistrationStatus
}

/**
 * Names whose registration expiry is in `(cursor, upperBound]` (unix seconds),
 * ascending by expiry, at most `maxRows` (default `QUERY_PAGE_SIZE`) of them.
 * `hasMore` is true when the window holds more rows than were returned.
 *
 * Reads bigname's `GET /v1/names` expiry sweep. Its window is
 * `[expires_after, expires_before)` and lease expiries are whole seconds, so
 * the half-open seconds window maps to `[cursor + 1, upperBound + 1)`. The
 * client retries transient failures (408/429/5xx, network, stale first page)
 * and the pager restarts when a continuation cursor goes stale.
 *
 * Rows are returned whatever their `registration_status` (released names are
 * listed with their lapsed expiry); callers filter per stage so page planning
 * still sees every row.
 */
export const fetchExpiringNamesPage = ResultFn(async function* (ctx: {
  env: CloudflareBindings
  stage: ExpiryStageConfig
  cursor: number
  upperBound: number
  maxRows?: number
}) {
  const maxRows = ctx.maxRows ?? QUERY_PAGE_SIZE
  logger.trace('Fetching expiring names page from bigname', {
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
        message: `bigname expiry query failed for stage ${ctx.stage.id}`,
        cause: error,
        status: isBignameError(error) ? error.status : undefined,
      }),
  )

  const domains: ExpiringDomain[] = []
  for (const row of result.rows) {
    const expiryDate = timestampToSeconds(row.expires_at)
    if (expiryDate === undefined) {
      logger.warn('bigname expiry row validation failed', {
        stage: ctx.stage.id,
        name: row.name,
        expiresAt: row.expires_at,
      })
      return yield* new IndexerValidationError({
        message: `bigname expiry row without a valid expires_at for stage ${ctx.stage.id}`,
      })
    }

    domains.push({
      name: row.name,
      expiryDate,
      owner: (row.owner ?? row.registrant)?.toLowerCase(),
      registrationStatus: row.registration_status,
    })
  }

  logger.debug('bigname expiry query succeeded', {
    stageId: ctx.stage.id,
    domainCount: domains.length,
    firstExpiryDate: domains[0]?.expiryDate,
    lastExpiryDate: domains.at(-1)?.expiryDate,
    hasMore: result.truncated,
  })

  return ok({ domains, hasMore: result.truncated })
})
