/**
 * Strongly-consistent per-account rate limiter for the orchestrator proxy.
 *
 * A single Durable Object instance owns the counters, so increments are
 * atomic and bursts cannot bypass the limit (which a KV-based limiter would
 * allow under eventual consistency). Counters are kept in memory with a
 * sliding reset window — good enough for throttling; not durable across DO
 * eviction, which is acceptable for rate limiting.
 */

import { DurableObject } from 'cloudflare:workers'

type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
}

export class RateLimiterDO extends DurableObject {
  private counters = new Map<string, { count: number; resetAt: number }>()

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const account = url.searchParams.get('account')
    if (!account) {
      return Response.json({ error: 'Missing account' }, { status: 400 })
    }

    const limit = Number(url.searchParams.get('limit')) || 50
    const windowMs = Number(url.searchParams.get('windowMs')) || 60_000

    const now = Date.now()
    const entry = this.counters.get(account)

    if (!entry || now > entry.resetAt) {
      const fresh = { count: 1, resetAt: now + windowMs }
      this.counters.set(account, fresh)
      return Response.json({
        allowed: true,
        remaining: limit - 1,
        resetAt: fresh.resetAt,
      } satisfies RateLimitResult)
    }

    entry.count++
    if (entry.count > limit) {
      return Response.json({
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      } satisfies RateLimitResult)
    }

    return Response.json({
      allowed: true,
      remaining: limit - entry.count,
      resetAt: entry.resetAt,
    } satisfies RateLimitResult)
  }
}
