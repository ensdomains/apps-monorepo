/**
 * Same-origin proxy for the Rhinestone Warp orchestrator.
 *
 * Routes all `/api/orchestrator/*` traffic through the manager's server
 * runtime so the Rhinestone API key is injected server-side (never shipped
 * in the client bundle) and gas is only sponsored for allowlisted ENS
 * operations. See `@/lib/orchestrator-proxy/handler`.
 */

import { createFileRoute } from '@tanstack/react-router'
import { handleOrchestratorRequest } from '@/lib/orchestrator-proxy/handler'

const proxy = ({
  request,
  params,
}: {
  request: Request
  params: { _splat?: string }
}) => handleOrchestratorRequest(request, params._splat)

export const Route = createFileRoute('/api/orchestrator/$')({
  server: {
    handlers: {
      GET: proxy,
      POST: proxy,
      PUT: proxy,
      OPTIONS: proxy,
    },
  },
})
