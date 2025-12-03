import { vValidator } from '@hono/valibot-validator'
import { and, eq } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import {
  USER_NOTIFICATION_METADATA,
  type UserChannel,
  UserChannelSchema,
  type UserNotificationKind,
  UserNotificationKindSchema,
} from '#types/notifications.js'
import { logger } from '#utils/logger.js'

/**
 * Notification preferences routes for managing user notification settings.
 *
 * This module handles:
 * - Getting user preferences with defaults
 * - Updating individual preference toggles
 * - Batch updating multiple preferences
 */
export default createApp()
  .basePath('/preferences')
  /**
   * GET /preferences
   *
   * Returns all user preferences hydrated with defaults per channel.
   * Structure: { [channel]: { [kind]: { enabled: boolean } } }
   */
  .get('/', ...requireAuth, injectDb, async (c) => {
    const userId = c.var.user_id

    // Get existing preferences
    const prefs = await c.var.db.query.notificationPreferences.findMany({
      where: eq(TABLE.notificationPreferences.user_id, userId),
    })

    // Get user's verified channels
    const channels = await c.var.db.query.userChannels.findMany({
      where: and(
        eq(TABLE.userChannels.user_id, userId),
        eq(TABLE.userChannels.status, 'verified'),
      ),
      columns: {
        channel: true,
      },
    })

    const verifiedChannels = channels.map((c) => c.channel)

    // Build response structure
    const response: Record<string, Record<string, { enabled: boolean }>> = {}

    for (const channel of verifiedChannels) {
      response[channel] = {}
      for (const kind of UserNotificationKindSchema.options.map(
        (o) => o.literal,
      )) {
        const row = prefs.find((p) => p.channel === channel && p.kind === kind)
        // Default: enabled=true (opt-out model)
        response[channel][kind] = {
          enabled:
            row?.enabled ??
            USER_NOTIFICATION_METADATA[kind].recommended ??
            true,
        }
      }
    }

    return c.json(response)
  })
  /**
   * PATCH /preferences/:kind
   *
   * Updates a single preference for a specific kind and channel.
   * Request body: { channel: string, enabled: boolean }
   */
  .patch(
    '/:kind',
    ...requireAuth,
    injectDb,
    vValidator(
      'param',
      v.object({
        kind: UserNotificationKindSchema,
      }),
    ),
    vValidator(
      'json',
      v.object({
        channel: UserChannelSchema,
        enabled: v.boolean(),
      }),
    ),
    async (c) => {
      const userId = c.var.user_id
      const { kind } = c.req.valid('param')
      const { channel, enabled } = c.req.valid('json')

      // Validate that the channel is verified for this user
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

      // If enabled=true and it's the default, delete the row (return to default)
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
        // If enabled=false, upsert the row
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
            set: {
              enabled: false,
              updated_at: new Date(),
            },
          })
      }

      logger.info('Preference updated', {
        userId,
        kind,
        channel,
        enabled,
      })

      return c.json({ kind, channel, enabled })
    },
  )
  /**
   * PATCH /preferences/batch
   *
   * Updates multiple preferences at once.
   * Request body: { [channel]: { [kind]: boolean } }
   */
  .patch(
    '/batch',
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
