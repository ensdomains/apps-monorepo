import type { Decorator } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import type { ComponentType } from 'react'

/**
 * Storybook decorators for stories that mount real app components.
 *
 * Components like `NotificationsDropdown`, `AllNotificationsPage`, etc. depend
 * on React Query and TanStack Router (`<Link>` resolution). These helpers
 * stand up just enough of each so we can render the real components in
 * Storybook without booting the full app shell.
 */

// ---------- QueryClient ----------

/**
 * Build a QueryClient pre-seeded with story-provided data. Pass query data
 * keyed by query key; each entry calls `queryClient.setQueryData(key, data)`.
 *
 * Each story should build its own client — sharing leaks state across stories.
 */
export const buildQueryClient = (
  seeds: Array<{ key: readonly unknown[]; data: unknown }> = [],
) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Stories should never hit the (absent) backend.
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
      },
    },
  })

  for (const { key, data } of seeds) {
    queryClient.setQueryData(key, data)
  }

  return queryClient
}

// ---------- TanStack Router ----------

/**
 * Paths that the notification components currently link to. Adding a `<Link>`
 * to a new path requires registering it here so the href resolves and the
 * Link doesn't warn at runtime.
 */
const STUB_LINK_PATHS = [
  '/notifications',
  '/notifications/settings',
  '/register/$name',
  '/renew/$name',
  '/dashboard',
] as const

/**
 * Builds a memory router whose root component renders the story. Child routes
 * for the link-target paths are registered as no-op components so `<Link>`s
 * resolve href correctly. Memory history starts at `/` so the root (the
 * story) is what renders.
 *
 * TanStack's `createRootRoute` accepts a `RouteComponent` (a no-arg function
 * component), not a generic `ComponentType<P>`, so the story component is
 * wrapped in a no-arg function to satisfy the route-component contract.
 */
const buildStubRouter = (StoryComponent: ComponentType) => {
  const rootRoute = createRootRoute({
    component: () => <StoryComponent />,
  })

  const childRoutes = STUB_LINK_PATHS.map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => null,
    }),
  )

  const routeTree = rootRoute.addChildren(childRoutes)

  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

// ---------- Combined provider decorator ----------

/**
 * Wraps a story in QueryClient + Router providers. Use this for any story
 * mounting real notification components.
 *
 * @example
 *   decorators: [
 *     withProviders({
 *       seeds: [{ key: notificationsInfiniteQuery.queryKey, data: ... }],
 *     }),
 *   ]
 */
export const withProviders =
  (
    options: { seeds?: Array<{ key: readonly unknown[]; data: unknown }> } = {},
  ): Decorator =>
  (Story) => {
    const queryClient = buildQueryClient(options.seeds)
    // `Story` is the storybook-provided component to render.
    const router = buildStubRouter(Story as unknown as ComponentType)

    return (
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
  }
