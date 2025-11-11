import { and, eq, isNull } from 'drizzle-orm'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'

export default createApp().get(
  '/unread-count',
  ...requireAuth,
  injectDb,
  async (c) => {
    const userId = c.var.user_id

    const unreadCount = await c.var.db.$count(
      TABLE.notifications,
      and(
        eq(TABLE.notifications.user_id, userId),
        isNull(TABLE.notifications.read_at),
      ),
    )

    return c.json({ unreadCount })
  },
)
