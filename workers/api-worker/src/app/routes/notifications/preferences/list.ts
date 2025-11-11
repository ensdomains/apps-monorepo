import { and, eq } from 'drizzle-orm'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import {
  USER_NOTIFICATION_METADATA,
  UserNotificationKindSchema,
} from '#types/notifications.js'

export default createApp().get('/', ...requireAuth, injectDb, async (c) => {
  const userId = c.var.user_id

  const prefs = await c.var.db.query.notificationPreferences.findMany({
    where: eq(TABLE.notificationPreferences.user_id, userId),
  })

  const channels = await c.var.db.query.userChannels.findMany({
    where: and(
      eq(TABLE.userChannels.user_id, userId),
      eq(TABLE.userChannels.status, 'verified'),
    ),
    columns: { channel: true },
  })

  const verifiedChannels = channels.map((c) => c.channel)

  const response: Record<string, Record<string, { enabled: boolean }>> = {}

  for (const channel of verifiedChannels) {
    response[channel] = {}
    for (const kind of UserNotificationKindSchema.options.map(
      (o) => o.literal,
    )) {
      const row = prefs.find((p) => p.channel === channel && p.kind === kind)
      response[channel][kind] = {
        enabled:
          row?.enabled ?? USER_NOTIFICATION_METADATA[kind].recommended ?? true,
      }
    }
  }

  return c.json(response)
})
