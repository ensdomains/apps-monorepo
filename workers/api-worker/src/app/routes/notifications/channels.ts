import type { ChannelData } from '@ens-apps/shared-schema/notifications'
import { TelegramAuthSchema } from '@ens-apps/shared-schema/telegram'
import { vValidator } from '@hono/valibot-validator'
import { and, eq, gt } from 'drizzle-orm'
import { okAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { intoDbResult, TABLE } from '#core/database/index.js'
import { sendVerificationEmail } from '#services/email/verification.js'
import { sendWelcomeEmail } from '#services/email/welcome.js'
import { sanitizeChannel } from '#services/notifications/helpers.js'
import {
  addContactToList,
  deleteContact,
  searchContact,
} from '#services/sendgrid/contacts.js'
import { verifyTelegramAuth } from '#services/telegram/auth.js'
import {
  createInlineKeyboard,
  makeTelegramRequest,
} from '#services/telegram/utils.js'
import { logger } from '#utils/logger.js'

// allowed push service endpoint prefixes (for SSRF protection)
const ALLOWED_PUSH_ENDPOINTS = [
  'https://fcm.googleapis.com/', // chrome, edge, android
  'https://updates.push.services.mozilla.com/', // firefox
  'https://push.services.mozilla.com/', // firefox (older)
  'https://web.push.apple.com/', // safari
] as const

const isAllowedPushEndpoint = (url: string): boolean => {
  // check common prefixes first
  if (ALLOWED_PUSH_ENDPOINTS.some((prefix) => url.startsWith(prefix))) {
    return true
  }

  // windows uses subdomains like wns2-par02p.notify.windows.com
  try {
    const parsed = new URL(url)
    if (
      parsed.protocol === 'https:' &&
      parsed.hostname.endsWith('.notify.windows.com')
    ) {
      return true
    }
  } catch {
    return false
  }

  return false
}

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

      // Upsert the channel
      const channel = await c.var.db
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
        return c.json({ error: 'Failed to create channel' }, 500)
      }

      // Create verification token
      const verification = await c.var.db
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
        return c.json({ error: 'Failed to create verification' }, 500)
      }

      // Send verification email
      const emailResult = await sendVerificationEmail(
        c.env.SENDGRID_API_KEY,
        c.env.EMAIL_FROM_ADDRESS,
        email,
        verification.token,
        c.env.MANAGER_APP_URL,
      )

      if (emailResult.isErr()) {
        logger.error('Failed to send verification email', {
          channelId: channel.id,
          email,
          error: emailResult.error,
        })
        return c.json({ error: 'Failed to send verification email' }, 500)
      }

      logger.info('Verification email sent', {
        channelId: channel.id,
        email,
      })

      return c.json({
        message: 'Verification email sent',
        expires_at: verification.expires_at,
        channelId: channel.id,
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

      // Send welcome email if target exists
      if (verification.channel?.target) {
        const welcomeResult = await sendWelcomeEmail(
          c.env.SENDGRID_API_KEY,
          c.env.EMAIL_FROM_ADDRESS,
          verification.channel.target,
          c.env.MANAGER_APP_URL,
        )

        if (welcomeResult.isErr()) {
          // Log error but don't fail the verification
          logger.error('Failed to send welcome email', {
            channelId: verification.channel_id,
            email: verification.channel.target,
            error: welcomeResult.error,
          })
        } else {
          logger.info('Welcome email sent', {
            channelId: verification.channel_id,
            email: verification.channel.target,
          })
        }
      }

      // broadcast list sync via waitUntil
      if (c.env.SENDGRID_BROADCAST_LIST_ID && verification.channel?.target) {
        c.executionCtx.waitUntil(
          Promise.resolve(
            addContactToList(
              {
                SENDGRID_API_KEY: c.env.SENDGRID_API_KEY,
                SENDGRID_BROADCAST_LIST_ID: c.env.SENDGRID_BROADCAST_LIST_ID,
              },
              verification.channel.target,
              verification.user_id,
            ),
          ).then((result) => {
            if (result.isErr()) {
              logger.error('Failed to add contact to broadcast list', {
                email: verification.channel?.target,
                error: result.error,
              })
            } else {
              logger.info('Added contact to broadcast list', {
                email: verification.channel?.target,
                jobId: result.value.jobId,
              })
            }
          }),
        )
      }

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

    // broadcast list cleanup via waitUntil
    if (
      channel.channel === 'email' &&
      channel.target &&
      c.env.SENDGRID_BROADCAST_LIST_ID
    ) {
      const env = {
        SENDGRID_API_KEY: c.env.SENDGRID_API_KEY,
        SENDGRID_BROADCAST_LIST_ID: c.env.SENDGRID_BROADCAST_LIST_ID,
      }
      c.executionCtx.waitUntil(
        Promise.resolve(
          searchContact(env, channel.target).andThen((contact) =>
            contact ? deleteContact(env, contact.id) : okAsync(undefined),
          ),
        ).then((result) => {
          if (result.isErr()) {
            logger.error('Failed to delete contact from SendGrid', {
              email: channel.target,
              error: result.error,
            })
          } else {
            logger.info('Deleted contact from SendGrid', {
              email: channel.target,
            })
          }
        }),
      )
    }

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

    if (!channel.target) {
      return c.json({ error: 'Channel has no target address' }, 400)
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

    // Send verification email
    const emailResult = await sendVerificationEmail(
      c.env.SENDGRID_API_KEY,
      c.env.EMAIL_FROM_ADDRESS,
      channel.target,
      verification.token,
      c.env.MANAGER_APP_URL,
    )

    if (emailResult.isErr()) {
      // Log error but don't fail the request - user can resend
      logger.error('Failed to send verification email', {
        channelId,
        email: channel.target,
        error: emailResult.error,
      })

      return c.json({ error: 'Failed to send verification email' }, 500)
    } else {
      logger.info('Verification email resent', {
        channelId,
        email: channel.target,
      })
    }

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

      const preferencesUrl = `${c.env.MANAGER_APP_URL}/notifications/settings`
      const keyboard = createInlineKeyboard([
        [
          {
            text: '⚙️ Manage Notification Preferences',
            url: preferencesUrl,
          },
        ],
      ])

      const messageResult = await makeTelegramRequest(
        c.env.TELEGRAM_BOT_TOKEN,
        'sendMessage',
        {
          chat_id: auth_data.id,
          text:
            '🎉 *Welcome to ENS Notifications!*\n\n' +
            "Your Telegram has been successfully connected and you're all set to receive notifications about your ENS domains.\n\n" +
            "You'll receive updates about:\n\n" +
            '• Domain expiry reminders\n' +
            '• Domain transfers\n' +
            '• And other important events\n\n' +
            'You can customize which notifications you receive at any time from your notification settings.\n\n' +
            '👥 *Want more ENS news & updates?*\n' +
            'Join our announcements group for broadcasts: [t.me/ens_updates](https://t.me/ens_updates)',
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        },
      )

      if (messageResult.isErr())
        return match(messageResult.error)
          .with(
            { code: 'TELEGRAM_API_REQUEST_ERROR', errorCode: 403 },
            async (e) => {
              logger.warn(
                'Telegram bot is not authorized to send messages to this user',
                {
                  channelId: channel.id,
                  userId,
                  error: e,
                },
              )

              const updateResult = await intoDbResult(
                c.var.db
                  .update(TABLE.userChannels)
                  .set({
                    status: 'pending',
                    status_reason: 'FORBIDDEN_BY_TELEGRAM',
                  })
                  .where(eq(TABLE.userChannels.id, channel.id)),
              )

              if (updateResult.isErr()) {
                logger.error('Failed to update user channel status', {
                  channelId: channel.id,
                  userId,
                  error: updateResult.error,
                })
                return c.json(
                  { error: 'Failed to mark channel as pending' },
                  500,
                )
              }

              return c.json({ ok: true })
            },
          )
          .with(
            {
              code: P.union(
                'TELEGRAM_API_RESPONSE_PARSE_ERROR',
                'TELEGRAM_API_REQUEST_ERROR',
              ),
            },
            (e) => {
              logger.error(
                'Failed to send telegram message on channel creation',
                {
                  channelId: channel.id,
                  error: e,
                },
              )
              return c.json({ error: 'Failed to send message' }, 400)
            },
          )
          .exhaustive()
      return c.json({ ok: true })
    },
  )
  // Push notification routes
  .get('/push/vapid-public-key', async (c) => {
    return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY })
  })
  .post(
    '/push',
    ...requireAuth,
    injectDb,
    vValidator(
      'json',
      v.object({
        endpoint: v.pipe(
          v.string(),
          v.url(),
          v.check(isAllowedPushEndpoint, 'Invalid push service endpoint'),
        ),
        expirationTime: v.optional(v.nullable(v.number())),
        keys: v.object({
          auth: v.string(),
          p256dh: v.string(),
        }),
      }),
    ),
    async (c) => {
      const userId = c.var.user_id
      const subscription = c.req.valid('json')

      // Check if already subscribed with this endpoint
      const existingChannel = await c.var.db.query.userChannels.findFirst({
        where: and(
          eq(TABLE.userChannels.user_id, userId),
          eq(TABLE.userChannels.channel, 'push'),
          eq(TABLE.userChannels.target, subscription.endpoint),
        ),
      })

      if (existingChannel) {
        // Update keys if subscription exists (keys may have rotated)
        await c.var.db
          .update(TABLE.userChannels)
          .set({
            data: {
              auth: subscription.keys.auth,
              p256dh: subscription.keys.p256dh,
              expirationTime: subscription.expirationTime ?? null,
            } satisfies ChannelData['push'],
          })
          .where(eq(TABLE.userChannels.id, existingChannel.id))

        logger.info('Push subscription updated', {
          userId,
          channelId: existingChannel.id,
        })

        return c.json({ id: existingChannel.id, updated: true })
      }

      // Create new push subscription
      const channel = await c.var.db
        .insert(TABLE.userChannels)
        .values({
          user_id: userId,
          channel: 'push',
          target: subscription.endpoint,
          data: {
            auth: subscription.keys.auth,
            p256dh: subscription.keys.p256dh,
            expirationTime: subscription.expirationTime ?? null,
          } satisfies ChannelData['push'],
          status: 'verified', // Push subscriptions are verified by the browser
          verified_at: new Date(),
        })
        .returning({ id: TABLE.userChannels.id })
        .then((channels) => channels.at(0))

      if (!channel) {
        return c.json({ error: 'Failed to create push subscription' }, 500)
      }

      logger.info('Push subscription created', {
        userId,
        channelId: channel.id,
      })

      return c.json({ id: channel.id }, 201)
    },
  )
  .route('/', idRoutes)
