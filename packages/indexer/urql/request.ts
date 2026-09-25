import type {
  AnyVariables,
  Client,
  CombinedError,
  DocumentInput,
} from '@urql/core'
import {
  createClient,
  fetchExchange,
  makeOperation,
  mapExchange,
} from '@urql/core'

/**
 * Pins queries to POST.
 *
 * urql only issues a GET when an operation's context sets `preferGetMethod`;
 * nothing in this repo does, so this is a safety net rather than a live
 * workaround. Predates the urql/graphql-request split — kept as-is.
 */
export const forcePostExchange = mapExchange({
  onOperation(operation) {
    if (operation.kind !== 'query') return operation
    if (!operation.context.preferGetMethod) return operation

    return makeOperation(operation.kind, operation, {
      preferGetMethod: false,
    })
  },
})

/**
 * A client for a one-off GraphQL endpoint — no document cache and no retry
 * exchange.
 *
 * For callers that talk to something other than the default indexer (the v1
 * subgraph, or a worker reading a configured endpoint) and either don't want
 * results retained for the life of the isolate or already own their retry
 * policy. Use `createIndexerClient` from `@ens-apps/indexer/urql` for normal
 * app queries.
 */
export const createPlainClient = (url: string): Client =>
  createClient({
    url,
    requestPolicy: 'network-only',
    exchanges: [forcePostExchange, fetchExchange],
  })

/**
 * Thrown when a query succeeds at the transport level but carries no `data`.
 *
 * Distinct from `CombinedError` so callers with a retry policy can tell it
 * apart: re-sending the same query gets the same empty payload, so it is never
 * worth retrying.
 */
export class EmptyGraphQLResponseError extends Error {
  override readonly name = 'EmptyGraphQLResponseError'

  constructor() {
    super('GraphQL query returned no data')
  }
}

/**
 * Everything {@link graphqlRequest} can reject with.
 *
 * `CombinedError` covers transport failures and GraphQL errors — including a
 * malformed body, which urql itself rejects as "No Content" before it reaches
 * us. {@link EmptyGraphQLResponseError} covers the one case urql passes
 * through: `{"data": null}` with no `errors`.
 *
 * Both extend `Error`, so `.message` is readable without narrowing.
 */
export type GraphqlRequestError = CombinedError | EmptyGraphQLResponseError

/**
 * Run `query` and resolve to its `data`, throwing on transport or GraphQL
 * errors.
 *
 * urql reports failures in the result (`{ data, error }`) rather than by
 * rejecting. Callers here uniformly want "give me the data or throw" so the
 * failure lands in the surrounding `fromPromise` / `try`, so unwrap it once
 * here instead of at every call site.
 */
export async function graphqlRequest<
  Data,
  Variables extends AnyVariables = AnyVariables,
>(
  client: Client,
  query: DocumentInput<Data, Variables>,
  variables?: Variables,
  signal?: AbortSignal,
): Promise<Data> {
  const result = await client
    .query<Data, Variables>(query, (variables ?? {}) as Variables, {
      fetchOptions: signal ? { signal } : undefined,
    })
    .toPromise()

  if (result.error) throw result.error
  if (!result.data) throw new EmptyGraphQLResponseError()

  return result.data
}
