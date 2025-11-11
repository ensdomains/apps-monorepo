import { requireAuth } from '#app/middleware/auth.js'
import { createApp } from '#app/middleware/hono.js'

export default createApp().get('/', ...requireAuth, async (c) => {
  return c.json({ address: c.var.address })
})
