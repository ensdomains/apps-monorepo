import { eq } from 'drizzle-orm'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import { sanitizeChannel } from '#services/notifications/helpers.js'
import idRoutes from './$id.js'
import emailRoutes from './email/index.js'
import telegramRoutes from './telegram.js'

export default createApp()
  .get('/', ...requireAuth, injectDb, async (c) => {
    const userId = c.var.user_id

    const channels = await c.var.db.query.userChannels.findMany({
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
      where: eq(TABLE.userChannels.user_id, userId),
    })

    const sanitizedChannels = channels.map(({ target, data, ...rest }) => ({
      ...rest,
      label: sanitizeChannel(rest.channel, target, data),
    }))

    return c.json(sanitizedChannels)
  })
  .route('/telegram', telegramRoutes)
  .route('/email', emailRoutes)
  .route('/', idRoutes)
