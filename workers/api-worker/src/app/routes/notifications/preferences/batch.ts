import { vValidator } from '@hono/valibot-validator'
import { and, eq } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import {
  type UserChannel,
  UserChannelSchema,
  type UserNotificationKind,
  UserNotificationKindSchema,
} from '#types/notifications.js'
import { logger } from '#utils/logger.js'

export default createApp().patch(
  '/',
  ...requireAuth,
  injectDb,
  vValidator(
    'json',
    v.record(
      UserChannelSchema, // channel
      v.record(UserNotificationKindSchema, v.boolean()), // kind -> enabled
    ),
  ),
  async (c) => {
    const userId = c.var.user_id
    const preferences = c.req.valid('json')

    // Validate all channels are verified
    const channels = Object.keys(preferences) as UserChannel[]
    const verifiedChannels = await c.var.db.query.userChannels.findMany({
      where: and(
        eq(TABLE.userChannels.user_id, userId),
        eq(TABLE.userChannels.status, 'verified'),
      ),
      columns: {
        channel: true,
      },
    })

    const verifiedChannelNames = verifiedChannels.map((c) => c.channel)
    const invalidChannels = channels.filter(
      (c) => !verifiedChannelNames.includes(c),
    )

    if (invalidChannels.length > 0) {
      return c.json(
        {
          error: `Invalid or unverified channels: ${invalidChannels.join(', ')}`,
        },
        400,
      )
    }

    // Process all preferences in a transaction
    await c.var.db.transaction(async (tx) => {
      for (const [channel, kinds] of Object.entries(preferences) as [
        UserChannel,
        Record<UserNotificationKind, boolean>,
      ][]) {
        for (const [kind, enabled] of Object.entries(kinds) as [
          UserNotificationKind,
          boolean,
        ][]) {
          if (enabled) {
            // Delete row to return to default
            await tx
              .delete(TABLE.notificationPreferences)
              .where(
                and(
                  eq(TABLE.notificationPreferences.user_id, userId),
                  eq(TABLE.notificationPreferences.kind, kind),
                  eq(TABLE.notificationPreferences.channel, channel),
                ),
              )
          } else {
            // Upsert disabled preference
            await tx
              .insert(TABLE.notificationPreferences)
              .values({
                // user_id: userId,
                user_id: userId,
                kind: kind as UserNotificationKind,
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
                set: {
                  enabled: false,
                  updated_at: new Date(),
                },
              })
          }
        }
      }
    })

    logger.info('Batch preferences updated', {
      userId,
      preferenceCount: Object.values(preferences).reduce(
        (sum, kinds) => sum + Object.keys(kinds).length,
        0,
      ),
    })

    return c.json({ message: 'Preferences updated successfully' })
  },
)
