import { cacheExchange, createClient, fetchExchange } from '@urql/core'
import { retryExchange } from '@urql/exchange-retry'

export const INDEXER_GRAPHQL_URL = 'https://ensv2.pff.sh/graphql'

export const createIndexerClient = () =>
  createClient({
    url: INDEXER_GRAPHQL_URL,
    requestPolicy: 'network-only',
    exchanges: [
      cacheExchange,
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

const indexerClient = createIndexerClient()

export default indexerClient
