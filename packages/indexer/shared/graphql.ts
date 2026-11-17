import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, ResultAsync } from 'neverthrow'
import { IndexerReadError } from '../reads/errors'

export const DEFAULT_TIMEOUT_MS = 15_000

/** A GraphQL request that failed, with what the server said, if anything. */
export class GraphqlRequestError extends TaggedError('GRAPHQL_REQUEST_ERROR')<{
  readonly cause: unknown
  readonly url: string
  readonly status?: number
  readonly errors?: readonly unknown[]
}> {}

export type GraphqlTransportOptions = Readonly<{
  url: string
  fetch?: typeof fetch
  timeoutMs?: number
}>

export type GraphqlRequest = <Data>(
  query: string,
  variables: Readonly<Record<string, unknown>>,
  signal?: AbortSignal,
) => ResultAsync<Data, IndexerReadError>

// 429 and 5xx are the server's trouble and pass; any other 4xx refuses the request as sent.
const isTransient = (status: number) => status === 429 || status >= 500

const toReadError = (
  kind: IndexerReadError['kind'],
  cause: GraphqlRequestError,
) => new IndexerReadError({ kind, message: cause.message, cause })

const hasErrors = (
  body: unknown,
): body is Readonly<{ errors: readonly unknown[] }> =>
  typeof body === 'object' &&
  body !== null &&
  'errors' in body &&
  Array.isArray(body.errors) &&
  body.errors.length > 0

const hasData = <Data>(body: unknown): body is Readonly<{ data: Data }> =>
  typeof body === 'object' && body !== null && 'data' in body && !!body.data

/** One GraphQL endpoint: GraphQL errors are `rejected`; network failures, timeouts, 429 and 5xx are `unavailable`. */
export const createGraphqlTransport = ({
  url,
  fetch: fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: GraphqlTransportOptions): GraphqlRequest => {
  const fail = (
    kind: IndexerReadError['kind'],
    message: string,
    extra: Readonly<{
      cause?: unknown
      status?: number
      errors?: readonly unknown[]
    }> = {},
  ) =>
    toReadError(
      kind,
      new GraphqlRequestError({ message, url, cause: extra.cause, ...extra }),
    )

  const send = ResultFn(async function* (
    query: string,
    variables: Readonly<Record<string, unknown>>,
    signal: AbortSignal | undefined,
  ) {
    const response = yield* ResultAsync.fromPromise(
      fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.any([
          ...(signal ? [signal] : []),
          AbortSignal.timeout(timeoutMs),
        ]),
      }),
      (cause) =>
        fail('unavailable', `${url} request failed: ${String(cause)}`, {
          cause,
        }),
    )
    const body = yield* ResultAsync.fromPromise(
      response.json() as Promise<unknown>,
      (cause) =>
        fail(
          response.ok || isTransient(response.status)
            ? 'unavailable'
            : 'rejected',
          `${url} responded ${response.status} with a body that is not JSON`,
          { cause, status: response.status },
        ),
    )
    if (hasErrors(body)) {
      return err(
        fail(
          isTransient(response.status) ? 'unavailable' : 'rejected',
          `${url} answered with GraphQL errors`,
          { status: response.status, errors: body.errors },
        ),
      )
    }
    if (!response.ok) {
      return err(
        fail(
          isTransient(response.status) ? 'unavailable' : 'rejected',
          `${url} responded ${response.status}`,
          { status: response.status },
        ),
      )
    }
    if (!hasData(body)) {
      return err(
        fail('unavailable', `${url} responded without data`, {
          status: response.status,
        }),
      )
    }
    return ok(body.data)
  })

  return <Data>(
    query: string,
    variables: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
    // The caller states the shape of its query's data; the server checked the query against its schema.
  ) => send(query, variables, signal).map((data) => data as Data)
}
