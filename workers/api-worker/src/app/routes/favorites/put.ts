import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { schema } from '#core/database/index.js'
import { logger } from '#utils/logger.js'

export default createApp().put(
  '/:name',
  ...requireAuth,
  injectDb,
  async (c) => {
    const { name } = c.req.param()
    const { user_id } = c.var

    logger.info('Adding favorite', { name, user_id })

    await c.var.db
      .insert(schema.favorites)
      .values({ name, user_id })
      .onConflictDoNothing()

    return c.json({ message: 'Favorite added' }, 200)
  },
)
