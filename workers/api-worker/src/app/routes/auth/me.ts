import { requireAuth } from '#app/middleware/auth.js'
import { createApp } from '../../middleware/hono'

export default createApp().get('/me', ...requireAuth, async (c) => {
  return c.json({ address: c.var.address })
})
