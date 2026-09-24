import { createPlainClient, graphqlRequest } from '@ens-apps/indexer/urql'
import type { AnyVariables, DocumentInput } from '@urql/core'
import { envConfig } from '@/config'

/**
 * Portal's indexer client.
 *
 * Deliberately a plain client rather than the shared `indexerClient`: that one
 * carries a `cacheExchange`, which rewrites documents to inject `__typename`
 * into every nested selection set and retains every response for the life of
 * the tab, and a `retryExchange` that re-sends permanently-failed queries.
 * Portal reads these payloads generically (`Object.entries` over event detail
 * objects), so an injected `__typename` would surface as a rendered field.
 */
const client = createPlainClient(envConfig.endpoints.indexerGraphql)

/**
 * Run an indexer query and resolve to its `data`, throwing on failure — every
 * caller wraps this in `fromPromise` and wants the data or a thrown error.
 */
export const graphqlIndexerClient = {
  request: <Data, Variables extends AnyVariables = AnyVariables>(
    query: DocumentInput<Data, Variables>,
    variables?: Variables,
  ): Promise<Data> => graphqlRequest(client, query, variables),
}
