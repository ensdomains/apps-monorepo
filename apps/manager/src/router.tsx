import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'
import { queryClient } from './utils/queryClient'

export function createRouter() {
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

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
