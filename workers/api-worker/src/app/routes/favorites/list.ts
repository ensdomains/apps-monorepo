import { eq } from 'drizzle-orm'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { schema } from '#core/database/index.js'

export default createApp().get('/', ...requireAuth, injectDb, async (c) => {
  const favorites = await c.var.db.query.favorites.findMany({
    where: eq(schema.favorites.user_id, c.var.user_id),
    columns: { name: true, created_at: true },
  })

  return c.json(favorites)
})
