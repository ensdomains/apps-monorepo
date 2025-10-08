import { vValidator } from '@hono/valibot-validator'
import { and, eq, gt } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { Database, TABLE } from '#core/database/index.js'
import { sanitizeChannel } from '#services/notifications/helpers.js'
import {
  TelegramAuthSchema,
  verifyTelegramAuth,
} from '#services/telegram/auth.js'
import { makeTelegramRequest } from '#services/telegram/utils.js'
import { UserChannel } from '#types/notifications.js'
import { logger } from '#utils/logger.js'

// Generate a random token that's somewhat user readable
const generateToken = () => {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  )
}

const emailRoutes = createApp()
  .basePath('/email')
  .post(
    '/',
    ...requireAuth,
    injectDb,
    vValidator(
      'json',
      v.object({
        email: v.pipe(v.string(), v.email()),
      }),
    ),
    async (c) => {
      const userId = c.var.user_id
      const { email } = c.req.valid('json')

      // Check if email is already linked to this user
      const existingChannel = await c.var.db.query.userChannels.findFirst({
        where: and(
          eq(TABLE.userChannels.user_id, userId),
          eq(TABLE.userChannels.channel, 'email'),
          eq(TABLE.userChannels.target, email),
        ),
      })

      if (existingChannel) {
        if (existingChannel.status === 'verified') {
          return c.json(
            { error: 'Email already verified for this account' },
            400,
          )
        }
        // If pending, we can resend verification
      }

      // Check if email is linked to another user
      const otherUserChannel = await c.var.db.query.userChannels.findFirst({
        where: and(
          eq(TABLE.userChannels.channel, 'email'),
          eq(TABLE.userChannels.target, email),
          eq(TABLE.userChannels.status, 'verified'),
        ),
      })

      if (otherUserChannel && otherUserChannel.user_id !== userId) {
        return c.json(
          { error: 'This email address is already linked to another account' },
          400,
        )
      }

      const result = await c.var.db.transaction(async (tx) => {
        // Upsert the channel
        const channel = await tx
          .insert(TABLE.userChannels)
          .values({
            user_id: userId,
            channel: 'email',
            status: 'pending',
            target: email,
          })
          .onConflictDoUpdate({
            target: [
              TABLE.userChannels.user_id,
              TABLE.userChannels.channel,
              TABLE.userChannels.target,
            ],
            set: {
              status: 'pending',
              last_verification_sent_at: new Date(),
            },
          })
          .returning({
            id: TABLE.userChannels.id,
          })
          .then((channels) => channels.at(0))

        if (!channel) {
          throw new Error('Failed to create channel')
        }

        // Create verification token
        const verification = await tx
          .insert(TABLE.channelVerifications)
          .values({
            user_id: userId,
            channel_id: channel.id,
            channel: 'email',
            purpose: 'verify',
            token: generateToken(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            attempts: 0,
          })
          .returning({
            id: TABLE.channelVerifications.id,
            token: TABLE.channelVerifications.token,
            expires_at: TABLE.channelVerifications.expires_at,
          })
          .then((verifications) => verifications.at(0))

        if (!verification) {
          throw new Error('Failed to create verification')
        }

        return {
          channel,
          verification,
        }
      })

      // TODO: Send verification email here
      // For now, we'll just return the token (in production, this should be sent via email)
      logger.info('Email verification token generated', {
        channelId: result.channel.id,
        email,
        token: result.verification.token,
      })

      return c.json({
        message: 'Verification email sent',
        expires_at: result.verification.expires_at,
        channelId: result.channel.id,
      })
    },
  )
  .post(
    '/verify',
    vValidator(
      'json',
      v.object({
        token: v.string(),
      }),
    ),
    injectDb,
    async (c) => {
      const { token } = c.req.valid('json')

      const verification = await c.var.db.query.channelVerifications.findFirst({
        where: and(
          eq(TABLE.channelVerifications.token, token),
          eq(TABLE.channelVerifications.purpose, 'verify'),
          gt(TABLE.channelVerifications.expires_at, new Date()),
        ),
        with: {
          channel: true,
        },
      })

      if (!verification) {
        return c.json({ error: 'Invalid or expired verification token' }, 400)
      }

      // Mark channel as verified
      await c.var.db
        .update(TABLE.userChannels)
        .set({
          status: 'verified',
          verified_at: new Date(),
        })
        .where(eq(TABLE.userChannels.id, verification.channel_id))

      // Delete the verification record
      await c.var.db
        .delete(TABLE.channelVerifications)
        .where(eq(TABLE.channelVerifications.id, verification.id))

      return c.json({ message: 'Email verified successfully' })
    },
  )

const idRoutes = createApp()
  .basePath('/:id')
  .get('/', ...requireAuth, injectDb, async (c) => {
    const userId = c.var.user_id
    const channelId = c.req.param('id')

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
  })
  .delete('/', ...requireAuth, injectDb, async (c) => {
    const userId = c.var.user_id
    const channelId = c.req.param('id')

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
  })
  .post('/test', ...requireAuth, injectDb, async (c) => {
    const userId = c.var.user_id
    const channelId = c.req.param('id')

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

    // TODO: Send test notification based on channel type
    // For now, just update the last_sent_at timestamp
    await c.var.db
      .update(TABLE.userChannels)
      .set({
        last_sent_at: new Date(),
      })
      .where(eq(TABLE.userChannels.id, channelId))

    return c.json({ message: 'Test notification sent successfully' })
  })
  .post('/resend', ...requireAuth, injectDb, async (c) => {
    const userId = c.var.user_id
    const channelId = c.req.param('id')

    const channel = await c.var.db.query.userChannels.findFirst({
      where: and(
        eq(TABLE.userChannels.id, channelId),
        eq(TABLE.userChannels.user_id, userId),
      ),
    })

    if (!channel) {
      return c.json({ error: 'Channel not found' }, 404)
    }

    if (channel.status !== 'pending') {
      return c.json({ error: 'Channel is not pending verification' }, 400)
    }

    // Check cooldown (5 minutes)
    if (channel.last_verification_sent_at) {
      const cooldownMs = 5 * 60 * 1000 // 5 minutes
      const timeSinceLastSent =
        Date.now() - new Date(channel.last_verification_sent_at).getTime()

      if (timeSinceLastSent < cooldownMs) {
        const remainingMs = cooldownMs - timeSinceLastSent
        const remainingMinutes = Math.ceil(remainingMs / (60 * 1000))
        return c.json(
          {
            error: `Please wait ${remainingMinutes} minutes before requesting another verification email`,
          },
          429,
        )
      }
    }

    // Create new verification token
    const verification = await c.var.db
      .insert(TABLE.channelVerifications)
      .values({
        user_id: userId,
        channel_id: channelId,
        channel: channel.channel,
        purpose: 'verify',
        token: generateToken(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        attempts: 0,
      })
      .returning({
        id: TABLE.channelVerifications.id,
        token: TABLE.channelVerifications.token,
      })
      .then((verifications) => verifications.at(0))

    if (!verification) {
      return c.json({ error: 'Failed to create verification' }, 500)
    }

    // Update last verification sent timestamp
    await c.var.db
      .update(TABLE.userChannels)
      .set({
        last_verification_sent_at: new Date(),
      })
      .where(eq(TABLE.userChannels.id, channelId))

    // TODO: Send verification email/notification
    logger.info('Verification resent', {
      channelId,
      channel: channel.channel,
      token: verification.token,
    })

    return c.json({ message: 'Verification sent successfully' })
  })

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
  .route('/', emailRoutes)
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

      const existingChannel = await c.var.db.query.userChannels.findFirst({
        where: and(
          eq(TABLE.userChannels.user_id, userId),
          eq(TABLE.userChannels.channel, 'telegram'),
          eq(TABLE.userChannels.target, auth_data.id.toString()),
        ),
      })

      if (existingChannel) {
        return c.json({ error: 'Channel already exists' }, 400)
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

      return c.json({ ok: true })
    },
  )
  .route('/', idRoutes)
