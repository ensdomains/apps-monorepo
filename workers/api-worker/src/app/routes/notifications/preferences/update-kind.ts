import { vValidator } from '@hono/valibot-validator'
import { and, eq } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import {
  UserChannelSchema,
  UserNotificationKindSchema,
} from '#types/notifications.js'
import { logger } from '#utils/logger.js'

export default createApp().patch(
  '/:kind',
  ...requireAuth,
  injectDb,
  vValidator('param', v.object({ kind: UserNotificationKindSchema })),
  vValidator(
    'json',
    v.object({ channel: UserChannelSchema, enabled: v.boolean() }),
  ),
  async (c) => {
    const userId = c.var.user_id
    const { kind } = c.req.valid('param')
    const { channel, enabled } = c.req.valid('json')

    const channelExists = await c.var.db.query.userChannels.findFirst({
      where: and(
        eq(TABLE.userChannels.user_id, userId),
        eq(TABLE.userChannels.channel, channel),
        eq(TABLE.userChannels.status, 'verified'),
      ),
    })

    if (!channelExists) {
      return c.json({ error: 'Channel not found or not verified' }, 400)
    }

    if (enabled) {
      await c.var.db
        .delete(TABLE.notificationPreferences)
        .where(
          and(
            eq(TABLE.notificationPreferences.user_id, userId),
            eq(TABLE.notificationPreferences.kind, kind),
            eq(TABLE.notificationPreferences.channel, channel),
          ),
        )
    } else {
      await c.var.db
        .insert(TABLE.notificationPreferences)
        .values({
          user_id: userId,
          kind,
          channel,
          enabled: false,
          updated_at: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            TABLE.notificationPreferences.user_id,
            TABLE.notificationPreferences.kind,
            TABLE.notificationPreferences.channel,
          ],
          set: { enabled: false, updated_at: new Date() },
        })
    }

    logger.info('Preference updated', { userId, kind, channel, enabled })
    return c.json({ kind, channel, enabled })
  },
)
