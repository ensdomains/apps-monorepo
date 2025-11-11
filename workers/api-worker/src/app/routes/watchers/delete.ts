import { and, eq } from 'drizzle-orm'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'

export default createApp().delete(
  '/:name',
  injectDb,
  ...requireAuth,
  async (c) => {
    const name = c.req.param('name')

    try {
      // Remove watcher
      const result = await c.var.db
        .delete(TABLE.ensWatchers)
        .where(
          and(
            eq(TABLE.ensWatchers.user_id, c.var.user_id),
            eq(TABLE.ensWatchers.name, name),
          ),
        )
        .returning()

      if (result.length === 0) {
        return c.json({ error: 'Watcher not found' }, 404)
      }

      // Check if there are any other watchers for this name
      const remainingWatchers = await c.var.db
        .select()
        .from(TABLE.ensWatchers)
        .where(eq(TABLE.ensWatchers.name, name))
        .limit(1)

      // If no watchers left, remove eval pointer
      if (remainingWatchers.length === 0) {
        await c.var.db
          .delete(TABLE.ensEvalPointers)
          .where(eq(TABLE.ensEvalPointers.name, name))
      }

      return c.json({ message: 'Successfully removed from watchlist' })
    } catch (error) {
      console.error('Error removing watcher:', error)
      return c.json({ error: 'Failed to remove watcher' }, 500)
    }
  },
)
