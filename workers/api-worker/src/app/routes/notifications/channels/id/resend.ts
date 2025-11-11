import { vValidator } from '@hono/valibot-validator'
import { and, eq } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import { sendVerificationEmail } from '#services/email/verification.js'
import { logger } from '#utils/logger.js'
import { generateToken } from '../utils.js'

export default createApp().post(
  '/resend',
  vValidator('param', v.object({ id: v.string() })),
  ...requireAuth,
  injectDb,
  async (c) => {
    const userId = c.var.user_id
    const { id: channelId } = c.req.valid('param')

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

    if (channel.last_verification_sent_at) {
      const cooldownMs = 5 * 60 * 1000
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

    const verification = await c.var.db
      .insert(TABLE.channelVerifications)
      .values({
        user_id: userId,
        channel_id: channelId,
        channel: channel.channel,
        purpose: 'verify',
        token: generateToken(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
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

    await c.var.db
      .update(TABLE.userChannels)
      .set({ last_verification_sent_at: new Date() })
      .where(eq(TABLE.userChannels.id, channelId))

    const emailResult = await sendVerificationEmail(
      c.env.SENDGRID_API_KEY,
      c.env.EMAIL_FROM_ADDRESS,
      channel.target!,
      verification.token,
      c.env.MANAGER_APP_URL,
    )

    if (emailResult.isErr()) {
      logger.error('Failed to send verification email', {
        channelId,
        email: channel.target,
        error: emailResult.error.message,
      })
    }

    return c.json({ message: 'Verification sent successfully' })
  },
)
