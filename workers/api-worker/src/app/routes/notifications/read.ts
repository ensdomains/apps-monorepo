import { vValidator } from '@hono/valibot-validator'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'

export default createApp().patch(
  '/read',
  ...requireAuth,
  injectDb,
  vValidator(
    'json',
    v.pipe(
      v.array(
        v.object({
          id: v.string(),
          source: v.picklist(['personal', 'broadcast']),
        }),
      ),
      v.maxLength(100),
    ),
  ),
  async (c) => {
    const notifications = c.req.valid('json')
    const userId = c.var.user_id

    const personal = notifications
      .filter((n) => n.source === 'personal')
      .map((n) => n.id)
    const broadcast = notifications
      .filter((n) => n.source === 'broadcast')
      .map((n) => n.id)

    if (personal.length > 0) {
      await c.var.db
        .update(TABLE.notifications)
        .set({ read_at: new Date() })
        .where(
          and(
            inArray(TABLE.notifications.id, personal),
            eq(TABLE.notifications.user_id, userId),
            isNull(TABLE.notifications.read_at),
          ),
        )
    }

    const now = sql`now()`

    if (broadcast.length > 0) {
      await c.var.db
        .insert(TABLE.broadcastsSeen)
        .values(
          broadcast.map((id) => ({
            user_id: userId,
            broadcast_id: id,
            read_at: now,
          })),
        )
        .onConflictDoNothing()
    }

    return c.json({ success: true })
  },
)
