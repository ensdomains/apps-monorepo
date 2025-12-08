import {
  type DehydrateOptions,
  MutationCache,
  QueryClient,
  type QueryKey,
} from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { createQueryCachePersistence } from './routerQueryCache'
import { routeTree } from './routeTree.gen'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      invalidates?: Array<QueryKey>
    }
    queryMeta: {
      dependsOn?: string[]
      persist?: boolean
    }
  }
}

const PERSIST_DB_NAME = '@manager-v4/query-cache'
const PERSIST_STORE_NAME = 'query-cache'
const PERSIST_KEY = 'state'
const PERSIST_LOCAL_KEY = '@manager-v4/query-cache'
const CACHE_VERSION = 1
const shouldPersistQuery: NonNullable<
  DehydrateOptions['shouldDehydrateQuery']
> = (query) => query.state.status === 'success' && query.meta?.persist === true

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 60 * 24,
        gcTime: 1000 * 60 * 60 * 24,
        refetchOnMount: 'always',
        refetchOnWindowFocus: 'always',
        refetchOnReconnect: true,
      },
    },
    mutationCache: new MutationCache({
      onSuccess: (_data, _variables, _context, mutation) => {
        if (mutation.meta?.invalidates) {
          for (const invalidate of mutation.meta.invalidates) {
            queryClient.invalidateQueries({
              queryKey: invalidate,
            })
          }
        }
      },
    }),
  })

  createQueryCachePersistence({
    queryClient,
    cacheVersion: CACHE_VERSION,
    shouldDehydrateQuery: shouldPersistQuery,
    localStorageKey: PERSIST_LOCAL_KEY,
    indexedDb: {
      dbName: PERSIST_DB_NAME,
      storeName: PERSIST_STORE_NAME,
      key: PERSIST_KEY,
    },
  })

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    context: {
      queryClient,
    },
  })

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  })

  return router
}
