import {
  type Authority,
  BignameError,
  createBignameClient,
  toProtocol,
  toUnixSeconds,
} from '@ens-apps/indexer/bigname'
import type { GraceProtocol } from '@ens-apps/utils/gracePeriod'
import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok, type Result } from 'neverthrow'
import { getConfig } from '#core/config.js'
import { logger } from '#utils/logger.js'

// bigname's largest page.
export const PAGE_SIZE = 200
const MAX_RETRIES = 3
const BASE_RETRY_DELAY_MS = 300
const MS_PER_SECOND = 1000
const SATURATED_LEASE = '9223372036854775807'
// How old the served state may be before notices from it are held.
export const MAX_INDEX_STALENESS_SECONDS = 15 * 60

export class IndexerRequestError extends TaggedError('INDEXER_REQUEST_ERROR')<{
  cause: unknown
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
// bigname's cursors hold no snapshot, so a stale page is retried as sent.
const isRetryable = (error: BignameError): boolean =>
  error.code === 'stale' ||
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
export type ExpiringName = {
  readonly name: string
  /** The registrar expiry: for an ENSv1 name its lease, not an ENSv2 reservation. */
  readonly expiryDate: number
  /** The served `expires_at` the listing is sorted and windowed by. */
  readonly listedAt: number
  readonly protocol: GraceProtocol
  /** Past its grace period; `owner` is then the last holder. */
  readonly isReleased: boolean
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
  /** What the read is for, in logs and errors. */
  readonly label: string
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
          message: `Indexer query failed for ${ctx.label}`,
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
      message: `Indexer response carried no chain position for ${ctx.label}`,
      cause: response.meta,
    })
  }

  const rows = response.data.flatMap((row) => {
    const protocol = toProtocol(row.authority)
    const lease = row.ens_v1?.expires_at
    // A saturated lease no longer carries its own date, so it has none to notify.
    if (protocol === 'v1' && lease === SATURATED_LEASE) return []
    return [
      {
        row,
        expiryDate: toUnixSeconds(
          protocol === 'v1' ? (lease ?? row.expires_at) : row.expires_at,
        ),
        listedAt: toUnixSeconds(row.expires_at),
        protocol,
      },
    ]
  })
  // The expiry window only lists rows with an expiry and an authority; a row
  // without either is a contract change, not a name to skip quietly.
  const unreadable = rows.find(
    ({ expiryDate, listedAt, protocol }) =>
      expiryDate === null || listedAt === null || protocol === null,
  )
  if (unreadable) {
    return yield* new IndexerValidationError({
      message: `Indexer listed ${unreadable.row.name} without a readable expiry or authority for ${ctx.label}`,
      cause: unreadable.row,
    })
  }
  const names = rows.flatMap(
    ({ row, expiryDate, listedAt, protocol }): ExpiringName[] =>
      expiryDate === null || listedAt === null || protocol === null
        ? []
        : [
            {
              name: row.name,
              expiryDate,
              listedAt,
              protocol,
              isReleased: row.registration_status === 'released',
              owner: (
                row.owner ?? row.lapsed_registration?.owner
              )?.toLowerCase(),
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
    label: ctx.label,
    expiresFrom: ctx.expiresFrom,
    expiresTo: ctx.expiresTo,
    authorities: ctx.authorities,
  })

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await executeIndexerQuery({ ...ctx, attempt })

    if (result.isOk()) {
      logger.debug('Indexer query succeeded', {
        label: ctx.label,
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
      label: ctx.label,
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
    label: ctx.label,
    attempts: MAX_RETRIES,
    expiresFrom: ctx.expiresFrom,
    expiresTo: ctx.expiresTo,
  })
  return yield* new IndexerRequestError({
    message: `Indexer query exhausted retries for ${ctx.label}`,
    cause: undefined,
    attempt: MAX_RETRIES,
  })
})

/** The chain time bigname's index has reached, from a one-row read. */
export const fetchIndexedAtSec = (env: CloudflareBindings, nowSec: number) =>
  fetchExpiringNamesPage({
    env,
    label: 'index position',
    expiresFrom: nowSec,
    expiresTo: nowSec,
  }).map((page) => page.indexedAtSec)

export type IndexReadiness =
  | { readonly isReady: true }
  | { readonly isReady: false; readonly reason: string }

/**
 * Whether bigname serves a recent enough view of the chain to notify from.
 * Unknown lag (a redo in progress) is not ready.
 */
export const fetchIndexReadiness = ResultFn(async function* (
  env: CloudflareBindings,
) {
  const { client, chainId } = yield* getIndexer(env)
  const { data } = yield* client.status().mapErr(
    (error) =>
      new IndexerRequestError({
        message: 'Indexer status request failed',
        cause: error,
        status: error.status,
        attempt: 1,
      }),
  )
  const chain = data.chains[String(chainId)]
  if (!chain) {
    return ok<IndexReadiness>({ isReady: false, reason: 'chain not served' })
  }
  if (chain.lag_seconds === null || chain.ingestion_lag_seconds === null) {
    return ok<IndexReadiness>({ isReady: false, reason: 'lag unknown' })
  }
  const stalenessSec = chain.lag_seconds + chain.ingestion_lag_seconds
  return ok<IndexReadiness>(
    stalenessSec <= MAX_INDEX_STALENESS_SECONDS
      ? { isReady: true }
      : { isReady: false, reason: `index ${stalenessSec}s behind the chain` },
  )
})
