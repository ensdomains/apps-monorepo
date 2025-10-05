import { vValidator } from '@hono/valibot-validator'
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import { sanitizeChannel } from '#services/notifications/helpers.js'
import {
  TelegramAuthSchema,
  verifyTelegramAuth,
} from '#services/telegram/auth.js'
import { makeTelegramRequest } from '#services/telegram/utils.js'
import type { DiscriminatedPayloadMapper, Prettify } from '#types/helpers.js'
import type {
  Broadcasts,
  ChannelData,
  Notifications,
} from '#types/notifications.js'
import { logger } from '#utils/logger.js'

// Generate a random token that's somewhat user readable
const generateToken = () => {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  )
}

/**
 * Notification routes for managing user notifications and broadcasts.
 *
 * This module handles:
 * - Personal notifications (user-specific events like name expiry, transfers)
 * - Broadcast notifications (system-wide announcements like blog posts)
 * - Pagination using cursor-based approach with UUIDv7 timestamps
 * - Marking notifications as read/unread and archived
 */
export default createApp()
  .basePath('/channels')
  /**
   * GET /notifications
   *
   * Retrieves a paginated list of notifications for the authenticated user.
   * Combines personal notifications and broadcast notifications, sorted by creation time.
   *
   * @param cursor - Optional cursor for pagination (UUIDv7 timestamp)
   * @returns Paginated list of notifications with next cursor
   */
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
        last_sent_at: true,
        last_bounce_at: true,
        verified_at: true,
        last_verification_sent_at: true,
        verification_attempts: true,
      },
      where: eq(TABLE.userChannels.user_id, userId),
    })

    const sanitizedChannels = channels.map(({ target, data, ...rest }) => ({
      ...rest,
      label: sanitizeChannel(rest.channel, target, data),
    }))

    return c.json(sanitizedChannels)
  })
  .post(
    '/telegram',
    ...requireAuth,
    injectDb,
    vValidator(
      'json',
      v.object({
        auth_data: TelegramAuthSchema,
      }),
    ),
    async (c) => {
      const userId = c.var.user_id
      const { auth_data } = c.req.valid('json')

      const authResult = await verifyTelegramAuth(
        c.env.TELEGRAM_BOT_TOKEN,
        auth_data,
      )
      if (authResult.isErr()) {
        switch (authResult.error.code) {
          case 'TELEGRAM_AUTH_DATA_EXPIRED':
            return c.json({ error: 'Telegram auth data expired' }, 400)
          case 'TELEGRAM_AUTH_DATA_HASH_MISMATCH':
            return c.json({ error: 'Telegram auth data hash mismatch' }, 400)
          default:
            return c.json({ error: 'Failed to verify Telegram auth data' }, 400)
        }
      }

      const channel = await c.var.db
        .insert(TABLE.userChannels)
        .values({
          user_id: userId,
          channel: 'telegram',
          status: 'verified',
          verified_at: new Date(),
          target: auth_data.id.toString(),
          data: {
            username: auth_data.username,
          },
        })
        .returning({
          id: TABLE.userChannels.id,
        })
        .then((channels) => channels.at(0))

      if (!channel) {
        return c.json({ error: 'Failed to create channel' }, 400)
      }

      const messageResult = await makeTelegramRequest(
        c.env.TELEGRAM_BOT_TOKEN,
        'sendMessage',
        {
          chat_id: auth_data.id,
          text: 'Welcome to the bot!',
        },
      )

      if (messageResult.isErr()) {
        logger.error('Failed to send telegram message on channel creation', {
          error: messageResult.error,
          channelId: channel.id,
        })
        return c.json({ error: 'Failed to send message' }, 400)
      }

      return c.json({ message: messageResult.value })
      // const result = await c.var.db.transaction(async (tx) => {
      //   const channel = await tx
      //     .insert(TABLE.userChannels)
      //     .values({
      //       user_id: userId,
      //       channel: 'telegram',
      //       status: 'pending',
      //       data: {
      //         username,
      //       },
      //     })
      //     .returning({
      //       id: TABLE.userChannels.id,
      //     })
      //     .then((channels) => channels.at(0))

      //   if (!channel) {
      //     throw new Error('Failed to create channel')
      //   }

      //   const verification = await tx
      //     .insert(TABLE.channelVerifications)
      //     .values({
      //       user_id: userId,
      //       channel_id: channel.id,
      //       channel: 'telegram',
      //       purpose: 'verify',
      //       token: generateToken(),
      //       expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      //       attempts: 0,
      //     })
      //     .returning({
      //       id: TABLE.channelVerifications.id,
      //       token: TABLE.channelVerifications.token,
      //       expires_at: TABLE.channelVerifications.expires_at,
      //     })
      //     .then((verifications) => verifications.at(0))

      //   if (!verification) {
      //     throw new Error('Failed to create verification')
      //   }

      //   return {
      //     channel,
      //     verification,
      //   }
      // })

      // return c.json({
      //   token: result.verification.token,
      //   expires_at: result.verification.expires_at,
      // })
    },
  )
