import { vValidator } from '@hono/valibot-validator'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'

export default createApp().patch(
  '/archive',
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

    const now = sql`now()`

    if (personal.length > 0) {
      await c.var.db
        .update(TABLE.notifications)
        .set({ archived_at: new Date() })
        .where(
          and(
            inArray(TABLE.notifications.id, personal),
            eq(TABLE.notifications.user_id, userId),
            isNull(TABLE.notifications.archived_at),
          ),
        )
    }

    if (broadcast.length > 0) {
      await c.var.db
        .insert(TABLE.broadcastsSeen)
        .values(
          broadcast.map((id) => ({
            user_id: userId,
            broadcast_id: id,
            read_at: now,
            archived_at: now,
          })),
        )
        .onConflictDoUpdate({
          target: [
            TABLE.broadcastsSeen.user_id,
            TABLE.broadcastsSeen.broadcast_id,
          ],
          set: { archived_at: now },
        })
    }

    return c.json({ success: true })
  },
)
