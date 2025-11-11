import { vValidator } from '@hono/valibot-validator'
import { and, eq } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'

export default createApp().post(
  '/test',
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

    if (channel.status !== 'verified') {
      return c.json(
        { error: 'Channel must be verified to send test notifications' },
        400,
      )
    }

    await c.var.db
      .update(TABLE.userChannels)
      .set({ last_sent_at: new Date() })
      .where(eq(TABLE.userChannels.id, channelId))

    return c.json({ message: 'Test notification sent successfully' })
  },
)
