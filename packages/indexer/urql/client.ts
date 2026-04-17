import {
  cacheExchange,
  createClient,
  fetchExchange,
  makeOperation,
  mapExchange,
} from '@urql/core'
import { retryExchange } from '@urql/exchange-retry'

function getIndexerUrl(): string {
  try {
    // Only use the custom URL on the client side — relative paths
    // like /indexer/graphql don't work during SSR.
    if (typeof window !== 'undefined') {
      const envUrl = import.meta.env?.VITE_INDEXER_GRAPHQL_URL
      if (envUrl) return envUrl
    }
  } catch {
    // SSR or non-Vite environment — fall through to default
  }
  return 'https://graphql.ens.dev/'
}

export const INDEXER_GRAPHQL_URL = getIndexerUrl()

const forcePostExchange = mapExchange({
  onOperation(operation) {
    if (operation.kind !== 'query') return operation
    if (!operation.context.preferGetMethod) return operation

    return makeOperation(operation.kind, operation, {
      preferGetMethod: false,
    })
  },
})

export const createIndexerClient = () =>
  createClient({
    url: INDEXER_GRAPHQL_URL,
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

let _indexerClient: ReturnType<typeof createIndexerClient> | null = null

function getIndexerClient() {
  if (!_indexerClient) {
    _indexerClient = createIndexerClient()
  }
  return _indexerClient
}

// Proxy that lazily initializes the client on first use.
// This ensures the client picks up the correct URL based on the runtime context.
const indexerClient = new Proxy({} as ReturnType<typeof createIndexerClient>, {
  get(_, prop) {
    return (getIndexerClient() as any)[prop]
  },
})

export default indexerClient
