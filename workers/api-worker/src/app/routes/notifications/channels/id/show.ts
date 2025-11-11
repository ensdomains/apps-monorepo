import { vValidator } from '@hono/valibot-validator'
import { and, eq } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import { sanitizeChannel } from '#services/notifications/helpers.js'

export default createApp().get(
  '/',
  vValidator('param', v.object({ id: v.string() })),
  ...requireAuth,
  injectDb,
  async (c) => {
    const userId = c.var.user_id
    const { id: channelId } = c.req.valid('param')

    const channel = await c.var.db.query.userChannels.findFirst({
      columns: {
        id: true,
        channel: true,
        target: true,
        data: true,
        status: true,
        status_reason: true,
        verified_at: true,
        last_sent_at: true,
        last_bounce_at: true,
        last_verification_sent_at: true,
      },
      where: and(
        eq(TABLE.userChannels.user_id, userId),
        eq(TABLE.userChannels.id, channelId),
      ),
    })

    if (!channel) {
      return c.json({ error: 'Channel not found' }, 404)
    }

    const { target, data, ...rest } = channel

    const sanitizedChannel = {
      ...rest,
      label: sanitizeChannel(rest.channel, target, data),
    }

    return c.json(sanitizedChannel)
  },
)
