import { and, eq } from 'drizzle-orm'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { schema } from '#core/database/index.js'

export default createApp().delete(
  '/:name',
  ...requireAuth,
  injectDb,
  async (c) => {
    const { name } = c.req.param()
    const { user_id } = c.var

    const result = await c.var.db
      .delete(schema.favorites)
      .where(
        and(
          eq(schema.favorites.name, name),
          eq(schema.favorites.user_id, user_id),
        ),
      )

    if (result.rowCount === 0) {
      return c.json({ message: 'Favorite not found' }, 404)
    }

    return c.json({ message: 'Favorite deleted' }, 200)
  },
)
