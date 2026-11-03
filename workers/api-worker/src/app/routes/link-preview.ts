import { createApp } from '#app/middleware/hono.js'
import { getLinkPreviewResponse } from '#services/link-preview/index.js'
import { normalizePreviewUrl } from '#services/link-preview/policy.js'
import { logger } from '#utils/logger.js'

const RATE_LIMIT_HEADERS = {
  'Cache-Control': 'no-store',
  'Retry-After': '60',
}

export default createApp().get('/link-preview/image', async (c) => {
  const url = normalizePreviewUrl(c.req.query('url') ?? '')
  if (url.isErr()) return c.body(null, 400, { 'Cache-Control': 'no-store' })
  const rateLimit = await c.env.LINK_PREVIEW_RATE_LIMITER?.limit({
    key: c.req.header('CF-Connecting-IP') ?? 'unknown',
  }).catch((cause: unknown) => {
    logger.warn('Link preview rate limiter unavailable', { cause })
  })
  if (!rateLimit) return c.body(null, 503, RATE_LIMIT_HEADERS)
  if (!rateLimit.success) return c.body(null, 429, RATE_LIMIT_HEADERS)
  return getLinkPreviewResponse({
    url: url.value,
    origin: new URL(c.req.url).origin,
    dependencies: {
      fetcher: fetch,
      kv: c.env.KV,
      cache: caches.default,
      now: Date.now,
      waitUntil: (promise) => c.executionCtx.waitUntil(promise),
    },
  })
})
