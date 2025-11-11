import { eq } from 'drizzle-orm'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'

export default createApp().get('/', injectDb, ...requireAuth, async (c) => {
  const watchers = await c.var.db
    .select({
      name: TABLE.ensWatchers.name,
      expiry_at: TABLE.ensNames.expiry_at,
      last_checked_at: TABLE.ensNames.last_checked_at,
    })
    .from(TABLE.ensWatchers)
    .leftJoin(TABLE.ensNames, eq(TABLE.ensWatchers.name, TABLE.ensNames.name))
    .where(eq(TABLE.ensWatchers.user_id, c.var.user_id))

  return c.json({ watchers })
})
