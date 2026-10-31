import { createApp } from '#app/middleware/hono.js'
import { getLinkPreviewResponse } from '#services/link-preview/index.js'
import { normalizePreviewUrl } from '#services/link-preview/policy.js'

export default createApp().get('/link-preview/image', async (c) => {
  const url = normalizePreviewUrl(c.req.query('url') ?? '')
  if (url.isErr()) return c.body(null, 400, { 'Cache-Control': 'no-store' })
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
