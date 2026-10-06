import {
  type Authority,
  BignameError,
  createBignameClient,
  isStale,
  toProtocol,
  toUnixSeconds,
} from '@ens-apps/indexer/bigname'
import type { GraceProtocol } from '@ens-apps/utils/gracePeriod'
import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok, type Result } from 'neverthrow'
import { getConfig } from '#core/config.js'
import type { ExpiryStageId } from '#types/events/index.js'
import { logger } from '#utils/logger.js'

// bigname's largest page.
export const PAGE_SIZE = 200
const MAX_RETRIES = 3
const BASE_RETRY_DELAY_MS = 300
const MS_PER_SECOND = 1000

export class IndexerRequestError extends TaggedError('INDEXER_REQUEST_ERROR')<{
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
  {
    readonly client: ReturnType<typeof createBignameClient>
    readonly chainId: number
  },
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

/** bigname rejected a page cursor because its index moved on. */
export const isStaleCursorError = (error: unknown): boolean =>
  error instanceof IndexerRequestError &&
  error.cause instanceof BignameError &&
  isStale(error.cause)

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const toIso = (seconds: number): string =>
  new Date(seconds * MS_PER_SECOND).toISOString()

// Times here are unix seconds as `number`, not bigint: the whole sweep, its
// stage maths and the cursors it stores already use them, and they fit exactly.
export type ExpiringName = {
  readonly name: string
  /** The registrar expiry. */
  readonly expiryDate: number
  readonly protocol: GraceProtocol
  readonly owner?: string
}

export type ExpiringNamesPage = {
  readonly names: readonly ExpiringName[]
  /** bigname's cursor for the same query, while it has more rows. */
  readonly nextCursor: string | null
  /** The chain time the answer belongs to, so a lagging index is visible. */
  readonly indexedAtSec: number
}

export type ExpiringNamesQuery = {
  readonly env: CloudflareBindings
  readonly stageId: ExpiryStageId
  /** Inclusive bounds on the registrar expiry. */
  readonly expiresFrom: number
  readonly expiresTo: number
  /** Every authority when absent. */
  readonly authorities?: readonly Authority[]
  readonly pageCursor?: string
}

const executeIndexerQuery = ResultFn(async function* (
  ctx: ExpiringNamesQuery & { readonly attempt: number },
) {
  const { client, chainId } = yield* getIndexer(ctx.env)

  const response = yield* client
    .names({
      namespace: 'ens',
      // Only .eth registrations have registrar grace.
      parent: 'eth',
      ...(ctx.authorities && { authority: ctx.authorities }),
      // bigname's window is inclusive below and exclusive above.
      expires_after: toIso(ctx.expiresFrom),
      expires_before: toIso(ctx.expiresTo + 1),
      sort: 'expires_at',
      order: 'asc',
      page_size: PAGE_SIZE,
      cursor: ctx.pageCursor,
    })
    .mapErr(
      (error) =>
        new IndexerRequestError({
          message: `Indexer query failed for stage ${ctx.stageId}`,
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
      message: `Indexer response carried no chain position for stage ${ctx.stageId}`,
      cause: response.meta,
    })
  }

  const rows = response.data.map((row) => ({
    row,
    expiryDate: toUnixSeconds(row.expires_at),
    protocol: toProtocol(row.authority),
  }))
  // The expiry window only lists rows with an expiry and an authority; a row
  // without either is a contract change, not a name to skip quietly.
  const unreadable = rows.find(
    ({ expiryDate, protocol }) => expiryDate === null || protocol === null,
  )
  if (unreadable) {
    return yield* new IndexerValidationError({
      message: `Indexer listed ${unreadable.row.name} without a readable expiry or authority for stage ${ctx.stageId}`,
      cause: unreadable.row,
    })
  }
  const names = rows.flatMap(({ row, expiryDate, protocol }): ExpiringName[] =>
    expiryDate === null || protocol === null
      ? []
      : [
          {
            name: row.name,
            expiryDate,
            protocol,
            owner: (row.owner ?? row.lapsed_registration?.owner)?.toLowerCase(),
          },
        ],
  )

  return ok<ExpiringNamesPage>({
    names,
    nextCursor: response.page?.has_more
      ? (response.page.next_cursor ?? null)
      : null,
    indexedAtSec,
  })
})

export const fetchExpiringNamesPage = ResultFn(async function* (
  ctx: ExpiringNamesQuery,
) {
  logger.trace('Fetching expiring names page from indexer', {
    stageId: ctx.stageId,
    expiresFrom: ctx.expiresFrom,
    expiresTo: ctx.expiresTo,
    authorities: ctx.authorities,
  })

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await executeIndexerQuery({ ...ctx, attempt })

    if (result.isOk()) {
      logger.debug('Indexer query succeeded', {
        stageId: ctx.stageId,
        attempt,
        nameCount: result.value.names.length,
        firstExpiryDate: result.value.names[0]?.expiryDate,
        lastExpiryDate: result.value.names.at(-1)?.expiryDate,
        hasNextPage: result.value.nextCursor !== null,
        indexedAtSec: result.value.indexedAtSec,
      })
      return ok(result.value)
    }

    const { error } = result
    if (
      error._tag !== 'INDEXER_REQUEST_ERROR' ||
      !(error.cause instanceof BignameError && isRetryable(error.cause)) ||
      attempt === MAX_RETRIES
    ) {
      return yield* error
    }

    const delayMs = toRetryDelayMs(attempt)
    logger.warn('Retrying indexer request after transient failure', {
      stageId: ctx.stageId,
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
    stageId: ctx.stageId,
    attempts: MAX_RETRIES,
    expiresFrom: ctx.expiresFrom,
    expiresTo: ctx.expiresTo,
  })
  return yield* new IndexerRequestError({
    message: `Indexer query exhausted retries for stage ${ctx.stageId}`,
    attempt: MAX_RETRIES,
  })
})
