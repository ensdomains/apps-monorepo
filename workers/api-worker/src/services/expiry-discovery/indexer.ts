import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { ClientError, gql, request } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import * as v from 'valibot'
import { logger } from '#utils/logger.js'
import type { ExpiryStageConfig } from './stages.js'

const DEFAULT_INDEXER_URL = 'https://graphql.ens.dev/'
export const PAGE_SIZE = 1000
const MAX_RETRIES = 3
const BASE_RETRY_DELAY_MS = 300

const expiringNamesQuery = gql`
  query GetExpiringNames($cursor: Int!, $upper_bound: Int!) {
    domains(
      where: { expiry_gt: $cursor, expiry_lte: $upper_bound }
      orderBy: expiryDate
      orderDirection: asc
      first: ${PAGE_SIZE}
    ) {
      name
      expiryDate
      owner {
        id
      }
    }
  }
`

/**
 * TODO: keep this query contract aligned with the external ENS indexer.
 * Required schema:
 * - domains[].name: string
 * - domains[].expiryDate: Int unix seconds
 * - domains[].owner.id: string | null
 */

const indexerResponseSchema = v.object({
  domains: v.array(
    v.object({
      name: v.string(),
      expiryDate: v.number(),
      owner: v.nullable(
        v.object({
          id: v.nullable(v.string()),
        }),
      ),
    }),
  ),
})

class IndexerRequestError extends TaggedError('INDEXER_REQUEST_ERROR')<{
  status?: number
  attempt: number
}> {}

class IndexerValidationError extends TaggedError('INDEXER_VALIDATION_ERROR') {}

class InvalidExpiryTimestampError extends TaggedError(
  'INVALID_EXPIRY_TIMESTAMP_ERROR',
)<{
  name: string
  expiryDate: string
}> {}

function getIndexerUrl(env: CloudflareBindings): string {
  return env.ENS_INDEXER_GRAPHQL_URL || DEFAULT_INDEXER_URL
}

function toRetryDelayMs(attempt: number): number {
  const jitter = Math.floor(Math.random() * 100)
  return BASE_RETRY_DELAY_MS * 2 ** (attempt - 1) + jitter
}

function isRetryableRequestError(error: unknown): boolean {
  if (error instanceof ClientError) {
    const status = error.response.status
    return status === 429 || status >= 500
  }

  return true
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export type ExpiringDomain = {
  name: string
  expiryDate: number
  owner?: string
}

const executeIndexerQuery = ResultFn(async function* (ctx: {
  env: CloudflareBindings
  stage: ExpiryStageConfig
  cursor: number
  upperBound: number
  attempt: number
}) {
  const rawResponse = yield* fromPromise(
    request(getIndexerUrl(ctx.env), expiringNamesQuery, {
      cursor: ctx.cursor.toString(),
      upper_bound: ctx.upperBound.toString(),
    }),
    (error) => {
      const status =
        error instanceof ClientError ? error.response.status : undefined

      return new IndexerRequestError({
        message: `Indexer query failed for stage ${ctx.stage.id}`,
        cause: error,
        status,
        attempt: ctx.attempt,
      })
    },
  )

  let parsedResponse: v.InferOutput<typeof indexerResponseSchema>

  try {
    parsedResponse = v.parse(indexerResponseSchema, rawResponse)
  } catch (error) {
    return yield* new IndexerValidationError({
      message: `Indexer response validation failed for stage ${ctx.stage.id}`,
      cause: error,
    })
  }

  const domains: ExpiringDomain[] = []

  for (const domain of parsedResponse.domains) {
    const owner = domain.owner?.id?.toLowerCase() ?? undefined

    domains.push({
      name: domain.name,
      expiryDate: domain.expiryDate,
      owner,
    })
  }

  return ok({
    domains,
    hasMore: parsedResponse.domains.length === PAGE_SIZE,
  })
})

export const fetchExpiringNamesPage = ResultFn(async function* (ctx: {
  env: CloudflareBindings
  stage: ExpiryStageConfig
  cursor: number
  upperBound: number
}) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await executeIndexerQuery({
      env: ctx.env,
      stage: ctx.stage,
      cursor: ctx.cursor,
      upperBound: ctx.upperBound,
      attempt,
    })

    if (result.isOk()) {
      return ok(result.value)
    }

    if (
      result.error._tag !== 'INDEXER_REQUEST_ERROR' ||
      !isRetryableRequestError(result.error.cause) ||
      attempt === MAX_RETRIES
    ) {
      return yield* result.error
    }

    const delayMs = toRetryDelayMs(attempt)
    logger.warn('Retrying indexer request after transient failure', {
      stage: ctx.stage.id,
      attempt,
      delayMs,
      status: result.error.status,
    })

    yield* fromPromise(
      wait(delayMs),
      (error) =>
        new IndexerRequestError({
          message: 'Failed while waiting to retry indexer request',
          cause: error,
          attempt,
        }),
    )
  }

  return yield* new IndexerRequestError({
    message: `Indexer query exhausted retries for stage ${ctx.stage.id}`,
    attempt: MAX_RETRIES,
  })
})
