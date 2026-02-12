import {
  MutationCache,
  QueryClient,
  type QueryKey,
} from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { initializeIntercom } from './lib/intercom'
import { routeTree } from './routeTree.gen'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      invalidates?: Array<QueryKey>
    }
    queryMeta: {
      dependsOn?: string[]
    }
  }
}

export function getRouter() {
  // Create a new QueryClient instance for each request to prevent query data from leaking between server requests.
  // For more details, see: https://tanstack.com/router/latest/docs/integrations/query
  // The QueryClient is available via the router context and can also be accessed in query/mutation handlers using their context argument.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
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

  initializeIntercom()

  return router
}
