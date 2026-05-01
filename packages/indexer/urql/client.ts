import {
  cacheExchange,
  createClient,
  fetchExchange,
  makeOperation,
  mapExchange,
} from '@urql/core'
import { retryExchange } from '@urql/exchange-retry'

export const INDEXER_GRAPHQL_URL = 'https://tenderly-ensv2.pff.sh/'

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

const indexerClient = createIndexerClient()

export default indexerClient
