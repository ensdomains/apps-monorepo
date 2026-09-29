import { cacheExchange, createClient, fetchExchange } from '@urql/core'
import { retryExchange } from '@urql/exchange-retry'
import { forcePostExchange } from './request'

export type { GraphqlRequestError } from './request'
export {
  createPlainClient,
  EmptyGraphQLResponseError,
  graphqlRequest,
} from './request'

/**
 * Build an indexer client for a GraphQL endpoint.
 *
 * The URL is a parameter rather than an env read so this package stays usable
 * from the browser, a Cloudflare Worker and tests alike. Each app resolves the
 * endpoint once at its composition root (`src/config.ts`) and passes it in.
 */
export const createIndexerClient = (url: string) =>
  createClient({
    url,
    requestPolicy: 'network-only',
    exchanges: [
      cacheExchange,
      forcePostExchange,
      retryExchange({
        initialDelayMs: 200,
        maxDelayMs: 5000,
        randomDelay: true,
        maxNumberAttempts: 3,
        retryIf: (error) => Boolean(error),
      }),
      fetchExchange,
    ],
  })
