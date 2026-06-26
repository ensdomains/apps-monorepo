/**
 * Custom Worker entrypoint for the manager app.
 *
 * Wraps TanStack Start's default server handler so we can also export the
 * `RateLimiterDO` Durable Object (used by the orchestrator proxy). Wrangler
 * requires Durable Object classes to be named exports of the Worker's main
 * module, which the framework's default `server-entry` does not provide.
 */

import handler from '@tanstack/react-start/server-entry'

export { RateLimiterDO } from '@/lib/orchestrator-proxy/rate-limiter'

export default {
  fetch: handler.fetch,
}
