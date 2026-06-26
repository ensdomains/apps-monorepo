/**
 * Core request handler for the Rhinestone orchestrator proxy.
 *
 * Runs server-side (TanStack Start server route, Cloudflare Worker runtime).
 * It keeps the Rhinestone API key out of the client bundle by injecting it
 * here, and only sponsors gas for allowlisted ENS operations. Per-account
 * rate limiting is enforced by a Durable Object.
 *
 * The endpoint is same-origin (served from the manager app), so there is no
 * CORS handling or cross-site origin allowlist — the browser only reaches it
 * from the app itself.
 */

import { env } from 'cloudflare:workers'
import {
  ALLOWED_SELECTORS,
  buildContractAllowlist,
  extractAccount,
  extractCalls,
  validateCalls,
} from './allowlist'

const ORCHESTRATOR_BASE = 'https://v1.orchestrator.rhinestone.dev'
const RATE_LIMIT = 50
const RATE_WINDOW_MS = 60_000

/** Strip the route prefix to recover the upstream orchestrator path. */
function upstreamUrl(request: Request, splat: string | undefined): string {
  const { search } = new URL(request.url)
  const path = splat ? `/${splat}` : ''
  return `${ORCHESTRATOR_BASE}${path}${search}`
}

/** Forward the request to the orchestrator with the API key injected. */
async function forward(
  request: Request,
  splat: string | undefined,
  body?: string,
) {
  const headers = new Headers(request.headers)
  headers.set('x-api-key', env.RHINESTONE_API_KEY)
  headers.delete('origin')
  headers.delete('host')

  const upstream = await fetch(upstreamUrl(request, splat), {
    method: request.method,
    headers,
    ...(body !== undefined && { body }),
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  })
}

/** Enforce the per-account sliding-window limit via the Durable Object. */
async function checkRateLimit(account: string): Promise<boolean> {
  const id = env.RATE_LIMITER.idFromName('global')
  const stub = env.RATE_LIMITER.get(id)
  const res = await stub.fetch(
    `http://rate-limiter/?account=${encodeURIComponent(account)}&limit=${RATE_LIMIT}&windowMs=${RATE_WINDOW_MS}`,
  )
  const { allowed } = await res.json<{ allowed: boolean }>()
  return allowed
}

/**
 * Handle a single proxied orchestrator request. `splat` is the catch-all
 * path tail from the server route (`params._splat`).
 */
export async function handleOrchestratorRequest(
  request: Request,
  splat: string | undefined,
): Promise<Response> {
  const method = request.method

  if (method !== 'POST' && method !== 'PUT') {
    return forward(request, splat)
  }

  const text = await request.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Only sponsor allowlisted ENS operations.
  const calls = extractCalls(body)
  if (calls.length > 0) {
    const contracts = await buildContractAllowlist(env.CHAIN)
    const result = validateCalls(calls, {
      contracts,
      selectors: ALLOWED_SELECTORS,
    })
    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 403 })
    }
  }

  // Rate-limit per smart account (fall back to client IP).
  const account =
    extractAccount(body) || request.headers.get('cf-connecting-ip') || 'unknown'
  if (!(await checkRateLimit(account))) {
    return Response.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  return forward(request, splat, text)
}
