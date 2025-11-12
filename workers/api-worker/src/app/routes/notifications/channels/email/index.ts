import { vValidator } from '@hono/valibot-validator'
import { and, eq } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import generateToken from '#app/utils/generateToken.js'
import { TABLE } from '#core/database/index.js'
import { sendVerificationEmail } from '#services/email/verification.js'
import { logger } from '#utils/logger.js'
import verifyRoutes from './verify.js'

export default createApp()
  .route('/verify', verifyRoutes)
  .post(
    '/',
    ...requireAuth,
    injectDb,
    vValidator('json', v.object({ email: v.pipe(v.string(), v.email()) })),
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

      // Send verification email
      const emailResult = await sendVerificationEmail(
        c.env.SENDGRID_API_KEY,
        c.env.EMAIL_FROM_ADDRESS,
        email,
        result.verification.token,
        c.env.MANAGER_APP_URL,
      )

      if (emailResult.isErr()) {
        // Log error but don't fail the request - user can resend
        logger.error('Failed to send verification email', {
          channelId: result.channel.id,
          email,
          error: emailResult.error.message,
        })
      } else {
        logger.info('Verification email sent', {
          channelId: result.channel.id,
          email,
        })
      }

      return c.json({
        message: 'Verification email sent',
        expires_at: result.verification.expires_at,
        channelId: result.channel.id,
      })
    },
  )
