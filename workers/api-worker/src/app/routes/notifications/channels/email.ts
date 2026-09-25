import { vValidator } from '@hono/valibot-validator'
import { and, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import {
  type BaseEnv,
  createApp,
  type Variables,
} from '#app/middleware/hono.js'
import { type Database, TABLE } from '#core/database/index.js'
import {
  cancelEmailChallenge,
  digestEmailOtp,
  generateEmailOtp,
  issueEmailChallenge,
  redeemEmailChallenge,
  secondsUntilEmailOtpResend,
} from '#services/email/challenges.js'
import { sendVerificationEmail } from '#services/email/verification.js'
import { sendWelcomeEmail } from '#services/email/welcome.js'
import {
  checkAndConsumeEmailVerificationRateLimit,
  formatEmailVerificationRateLimitError,
} from '#services/notifications/email-verification-rate-limit.js'
import { addContactToList } from '#services/sendgrid/contacts.js'
import { logger } from '#utils/logger.js'

export const addEmailChannelBodySchema = v.object({
  email: v.pipe(v.string(), v.trim(), v.minLength(1), v.email()),
})

export const verifyEmailChannelBodySchema = v.object({
  otp: v.pipe(v.string(), v.regex(/^\d{6}$/)),
})

type EmailContext = Context<
  BaseEnv & Variables<{ user_id: string; address: string; db: Database }>
>

const sendChallenge = async (c: EmailContext, email: string) => {
  const userId = c.var.user_id
  const previous = await c.var.db.query.emailVerifications.findFirst({
    columns: { otp_digest: true, last_sent_at: true },
    where: eq(TABLE.emailVerifications.user_id, userId),
  })
  const resendWait = previous
    ? secondsUntilEmailOtpResend(previous.last_sent_at)
    : 0
  if (resendWait > 0) {
    return c.json(
      {
        error: `Please wait ${resendWait} seconds before requesting another verification code`,
      },
      429,
    )
  }

  let rateLimit: Awaited<
    ReturnType<typeof checkAndConsumeEmailVerificationRateLimit>
  >
  try {
    rateLimit = await checkAndConsumeEmailVerificationRateLimit(
      c.env.KV,
      userId,
    )
  } catch (error) {
    logger.error('Email verification rate limit unavailable', { userId, error })
    return c.json({ error: 'Verification temporarily unavailable' }, 503)
  }
  if (!rateLimit.isAllowed) {
    return c.json(
      {
        error: formatEmailVerificationRateLimitError(
          rateLimit.retryAfterSeconds,
        ),
      },
      429,
    )
  }

  let otp = generateEmailOtp()
  let digest = await digestEmailOtp(c.env.JWT_SECRET, userId, otp)
  while (digest === previous?.otp_digest) {
    otp = generateEmailOtp()
    digest = await digestEmailOtp(c.env.JWT_SECRET, userId, otp)
  }
  const challenge = await issueEmailChallenge(c.var.db, {
    userId,
    email,
    digest,
  })
  if (!challenge) {
    return c.json({ error: 'Too many verification emails requested' }, 429)
  }

  const sent = await sendVerificationEmail(
    c.env.SENDGRID_API_KEY,
    c.env.EMAIL_FROM_ADDRESS,
    email,
    otp,
    c.var.address,
  )
  if (sent.isErr()) {
    // Keep the same challenge and cooldown state for accepted and rejected
    // requests; otherwise resend and channel listing reveal provider results.
    logger.error('Failed to send verification email', {
      challengeId: challenge.id,
      error: sent.error,
    })
  }

  return c.json({
    message: 'Verification email requested',
    challengeId: challenge.id,
    expires_at: challenge.expires_at,
  })
}

export default createApp()
  .basePath('/email')
  .post(
    '/',
    ...requireAuth,
    injectDb,
    vValidator('json', addEmailChannelBodySchema),
    async (c) => {
      const email = c.req.valid('json').email
      const existing = await c.var.db.query.userChannels.findFirst({
        columns: { status: true },
        where: and(
          eq(TABLE.userChannels.user_id, c.var.user_id),
          eq(TABLE.userChannels.channel, 'email'),
          eq(TABLE.userChannels.target, email),
        ),
      })
      if (existing?.status === 'verified') {
        return c.json({ error: 'Email already connected to this account' }, 400)
      }
      return sendChallenge(c, email)
    },
  )
  .post('/:id/resend', ...requireAuth, injectDb, async (c) => {
    const challenge = await c.var.db.query.emailVerifications.findFirst({
      columns: { email: true },
      where: and(
        eq(TABLE.emailVerifications.id, c.req.param('id')),
        eq(TABLE.emailVerifications.user_id, c.var.user_id),
      ),
    })
    if (!challenge) return c.json({ error: 'Verification not found' }, 404)
    return sendChallenge(c, challenge.email)
  })
  .delete('/:id', ...requireAuth, injectDb, async (c) => {
    const deleted = await cancelEmailChallenge(
      c.var.db,
      c.var.user_id,
      c.req.param('id'),
    )
    return deleted
      ? c.json({ message: 'Verification cancelled' })
      : c.json({ error: 'Verification not found' }, 404)
  })
  .post(
    '/:id/verify',
    ...requireAuth,
    injectDb,
    vValidator('json', verifyEmailChannelBodySchema),
    async (c) => {
      const digest = await digestEmailOtp(
        c.env.JWT_SECRET,
        c.var.user_id,
        c.req.valid('json').otp,
      )
      const channel = await redeemEmailChallenge(c.var.db, {
        userId: c.var.user_id,
        challengeId: c.req.param('id'),
        digest,
      })
      if (!channel) {
        return c.json({ error: 'Invalid or expired verification code' }, 400)
      }

      c.executionCtx.waitUntil(
        Promise.resolve(
          sendWelcomeEmail(
            c.env.SENDGRID_API_KEY,
            c.env.EMAIL_FROM_ADDRESS,
            channel.email,
            c.env.MANAGER_APP_URL,
          ),
        ).then((result) => {
          if (result.isErr()) {
            logger.error('Failed to send welcome email', {
              channelId: channel.id,
              error: result.error,
            })
          }
        }),
      )
      if (c.env.SENDGRID_BROADCAST_LIST_ID) {
        c.executionCtx.waitUntil(
          Promise.resolve(
            addContactToList(
              {
                SENDGRID_API_KEY: c.env.SENDGRID_API_KEY,
                SENDGRID_BROADCAST_LIST_ID: c.env.SENDGRID_BROADCAST_LIST_ID,
              },
              channel.email,
              c.var.user_id,
            ),
          ).then((result) => {
            if (result.isErr()) {
              logger.error('Failed to add contact to broadcast list', {
                channelId: channel.id,
                error: result.error,
              })
            }
          }),
        )
      }
      return c.json({
        message: 'Email verified successfully',
        channelId: channel.id,
      })
    },
  )
