import { vValidator } from '@hono/valibot-validator'
import { and, eq } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'

export default createApp().delete(
  '/',
  vValidator('param', v.object({ id: v.string() })),
  ...requireAuth,
  injectDb,
  async (c) => {
    const userId = c.var.user_id
    const { id: channelId } = c.req.valid('param')

    const channel = await c.var.db.query.userChannels.findFirst({
      where: and(
        eq(TABLE.userChannels.id, channelId),
        eq(TABLE.userChannels.user_id, userId),
      ),
    })

    if (!channel) {
      return c.json({ error: 'Channel not found' }, 404)
    }

    await c.var.db
      .delete(TABLE.userChannels)
      .where(eq(TABLE.userChannels.id, channelId))

    return c.json({ message: 'Channel deleted successfully' })
  },
)
