import { waitUntil } from 'cloudflare:workers'
import type { AnyRouter } from '@tanstack/react-router'
import { getRequest } from '@tanstack/react-start/server'

/**
 * Keeps the request alive until the code for the routes it matches has loaded.
 *
 * The router caches a route's in-flight chunk load on the route, which every
 * request on a worker shares, but stops waiting for it when the loader throws.
 * The Workers runtime then drops the load with the finished request and every
 * later request for that route waits on it forever. Fixed upstream in
 * router-core 1.171: remove this once the manager is on it.
 */
export const keepRouteChunkLoadsAlive = (router: AnyRouter) => {
  const { matchedRoutes } = router.getMatchedRoutes(
    new URL(getRequest().url).pathname,
  )
  // The router leaves the chunk of a route that opts out of SSR, and of every
  // route below it, to the browser.
  const firstClientOnly = matchedRoutes.findIndex(
    (route) => (route.options.ssr ?? true) !== true,
  )

  waitUntil(
    Promise.allSettled(
      matchedRoutes
        .slice(0, firstClientOnly === -1 ? undefined : firstClientOnly)
        .map((route) => router.loadRouteChunk(route)),
    ),
  )
}
