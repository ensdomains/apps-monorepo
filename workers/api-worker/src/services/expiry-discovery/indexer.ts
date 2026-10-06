import type { BignameError } from '@ens-apps/indexer/bigname'
import { createBignameClient, toUnixSeconds } from '@ens-apps/indexer/bigname'
import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok, type Result } from 'neverthrow'
import { getConfig } from '#core/config.js'
import { logger } from '#utils/logger.js'
import type { ExpiryStageConfig } from './stages.js'

// bigname serves at most 200 rows a page; one is kept back as lookahead.
export const PROCESS_PAGE_SIZE = 199
export const QUERY_PAGE_SIZE = PROCESS_PAGE_SIZE + 1
// Names sharing one expiry second are paged with bigname's cursor, up to the
// 1,000 the Panoptes query allowed.
export const MAX_EXACT_TIMESTAMP_PAGES = 5
export const MAX_PER_TIMESTAMP = QUERY_PAGE_SIZE * MAX_EXACT_TIMESTAMP_PAGES
const MAX_RETRIES = 3
const BASE_RETRY_DELAY_MS = 300
const MS_PER_SECOND = 1000

class IndexerRequestError extends TaggedError('INDEXER_REQUEST_ERROR')<{
  status?: number
  attempt: number
}> {}

class IndexerValidationError extends TaggedError('INDEXER_VALIDATION_ERROR')<{
  cause: unknown
}> {}

class IndexerConfigError extends TaggedError('INDEXER_CONFIG_ERROR')<{
  cause: unknown
}> {}

/**
 * Resolving the network can fail (an absent or unknown `CHAIN`). Returning a
 * Result keeps that inside the caller's error channel instead of rejecting the
 * generator, which would bypass the cron's failure handling.
 */
const getIndexer = (
  env: CloudflareBindings,
): Result<
  { client: ReturnType<typeof createBignameClient>; chainId: number },
  IndexerConfigError
> =>
  fromSync(
    () => {
      const config = getConfig(env)
      return {
        client: createBignameClient(config.endpoints.bignameApi),
        chainId: config.chain.id,
      }
    },
    (error) => new IndexerConfigError({ cause: error }),
  )

const toRetryDelayMs = (attempt: number): number => {
  const jitter = Math.floor(Math.random() * 100)
  return BASE_RETRY_DELAY_MS * 2 ** (attempt - 1) + jitter
}

// The client makes one attempt per call by design; the retry policy is the
// job's. Anything transient, or with no status at all, is worth another try.
const isRetryable = (error: BignameError): boolean =>
  error.code === 'network' ||
  error.status === undefined ||
  error.status === 429 ||
  error.status >= 500

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const toIso = (seconds: number): string =>
  new Date(seconds * MS_PER_SECOND).toISOString()

// Times here are unix seconds as `number`, not bigint: the whole sweep, its
// stage maths and the cursors it stores already use them, and they fit exactly.
export type ExpiringDomain = {
  readonly name: string
  readonly expiryDate: number
  readonly owner?: string
}

export type ExpiringNamesPage = {
  readonly domains: readonly ExpiringDomain[]
  readonly hasMore: boolean
  /** bigname's cursor for the same window, while it has more rows. */
  readonly nextCursor: string | null
  /** The chain time the answer belongs to, so a lagging index is visible. */
  readonly indexedAtSec: number
}

const executeIndexerQuery = ResultFn(async function* (ctx: {
  env: CloudflareBindings
  stage: ExpiryStageConfig
  cursor: number
  upperBound: number
  pageCursor?: string
  attempt: number
}) {
  const { client, chainId } = yield* getIndexer(ctx.env)

  // The old query was `expiry_gt cursor, expiry_lte upperBound`. bigname's
  // window is inclusive below and exclusive above, so both bounds shift by one
  // second to cover the same names.
  const response = yield* client
    .names({
      namespace: 'ens',
      // Stage timings use ENSv2's grace period, and only .eth registrations
      // have registrar grace at all.
      parent: 'eth',
      authority: 'ens_v2',
      expires_after: toIso(ctx.cursor + 1),
      expires_before: toIso(ctx.upperBound + 1),
      sort: 'expires_at',
      order: 'asc',
      page_size: QUERY_PAGE_SIZE,
      cursor: ctx.pageCursor,
    })
    .mapErr(
      (error) =>
        new IndexerRequestError({
          message: `Indexer query failed for stage ${ctx.stage.id}`,
          cause: error,
          status: error.status,
          attempt: ctx.attempt,
        }),
    )

  const indexedAtSec = toUnixSeconds(
    response.meta.as_of?.[String(chainId)]?.timestamp,
  )
  if (indexedAtSec === null) {
    return yield* new IndexerValidationError({
      message: `Indexer response carried no chain position for stage ${ctx.stage.id}`,
      cause: response.meta,
    })
  }

  const domains: ExpiringDomain[] = []
  for (const row of response.data) {
    // The expiry window only lists rows with an expiry; a row without one is
    // a contract change, not a name to skip quietly.
    const expiryDate = toUnixSeconds(row.expires_at)
    if (expiryDate === null) {
      return yield* new IndexerValidationError({
        message: `Indexer listed ${row.name} without a readable expiry for stage ${ctx.stage.id}`,
        cause: row,
      })
    }
    domains.push({
      name: row.name,
      expiryDate,
      owner: (row.owner ?? row.lapsed_registration?.owner)?.toLowerCase(),
    })
  }

  return ok({
    domains,
    hasMore: domains.length === QUERY_PAGE_SIZE,
    nextCursor: response.page?.has_more
      ? (response.page.next_cursor ?? null)
      : null,
    indexedAtSec,
  } satisfies ExpiringNamesPage)
})

export const fetchExpiringNamesPage = ResultFn(async function* (ctx: {
  env: CloudflareBindings
  stage: ExpiryStageConfig
  cursor: number
  upperBound: number
  pageCursor?: string
}) {
  logger.trace('Fetching expiring names page from indexer', {
    stageId: ctx.stage.id,
    cursor: ctx.cursor,
    upperBound: ctx.upperBound,
  })

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await executeIndexerQuery({
      env: ctx.env,
      stage: ctx.stage,
      cursor: ctx.cursor,
      upperBound: ctx.upperBound,
      pageCursor: ctx.pageCursor,
      attempt,
    })

    if (result.isOk()) {
      logger.debug('Indexer query succeeded', {
        stageId: ctx.stage.id,
        attempt,
        domainCount: result.value.domains.length,
        firstExpiryDate: result.value.domains[0]?.expiryDate,
        lastExpiryDate: result.value.domains.at(-1)?.expiryDate,
        hasMore: result.value.hasMore,
        indexedAtSec: result.value.indexedAtSec,
      })
      return ok(result.value)
    }

    const { error } = result
    if (
      error._tag !== 'INDEXER_REQUEST_ERROR' ||
      !isRetryable(error.cause as BignameError) ||
      attempt === MAX_RETRIES
    ) {
      return yield* error
    }

    const delayMs = toRetryDelayMs(attempt)
    logger.warn('Retrying indexer request after transient failure', {
      stageId: ctx.stage.id,
      attempt,
      maxAttempts: MAX_RETRIES,
      delayMs,
      status: error.status,
      error: error.message,
    })

    yield* fromPromise(
      wait(delayMs),
      (cause) =>
        new IndexerRequestError({
          message: 'Failed while waiting to retry indexer request',
          cause,
          attempt,
        }),
    )
  }

  logger.error('Indexer query exhausted retries', {
    stageId: ctx.stage.id,
    attempts: MAX_RETRIES,
    cursor: ctx.cursor,
    upperBound: ctx.upperBound,
  })
  return yield* new IndexerRequestError({
    message: `Indexer query exhausted retries for stage ${ctx.stage.id}`,
    attempt: MAX_RETRIES,
  })
})
