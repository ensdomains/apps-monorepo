import { eq } from 'drizzle-orm'
import * as v from 'valibot'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import { logger } from '#utils/logger.js'

// SendGrid event types we care about
const SendGridEventSchema = v.object({
  email: v.string(),
  event: v.union([
    v.literal('bounce'),
    v.literal('dropped'),
    v.literal('spamreport'),
    v.literal('unsubscribe'),
    v.literal('group_unsubscribe'),
  ]),
  timestamp: v.number(),
  reason: v.optional(v.string()),
  type: v.optional(v.string()), // bounce type
  sg_event_id: v.optional(v.string()),
  sg_message_id: v.optional(v.string()),
})

const SendGridWebhookPayloadSchema = v.array(SendGridEventSchema)

/**
 * verify SendGrid webhook signature using ECDSA.
 * https://docs.sendgrid.com/for-developers/tracking-events/getting-started-event-webhook-security-features
 */
async function verifySignature(
  publicKey: string,
  payload: string,
  signature: string,
  timestamp: string,
): Promise<boolean> {
  try {
    // SendGrid signs: timestamp + payload
    const signedPayload = timestamp + payload

    // import the public key (base64 encoded ECDSA P-256 key)
    const keyData = Uint8Array.from(atob(publicKey), (c) => c.charCodeAt(0))
    const cryptoKey = await crypto.subtle.importKey(
      'spki',
      keyData,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )

    // decode signature (base64)
    const signatureData = Uint8Array.from(atob(signature), (c) =>
      c.charCodeAt(0),
    )

    // verify
    const encoder = new TextEncoder()
    const isValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      signatureData,
      encoder.encode(signedPayload),
    )

    return isValid
  } catch (error) {
    logger.error('SendGrid signature verification failed', { error })
    return false
  }
}

export default createApp()
  .basePath('/sendgrid')
  .post('/events', injectDb, async (c) => {
    // verify webhook signature if secret is configured
    if (c.env.SENDGRID_WEBHOOK_VERIFICATION_KEY) {
      const signature = c.req.header('X-Twilio-Email-Event-Webhook-Signature')
      const timestamp = c.req.header('X-Twilio-Email-Event-Webhook-Timestamp')

      if (!signature || !timestamp) {
        return c.json({ error: 'Missing signature headers' }, 401)
      }

      const rawBody = await c.req.text()
      const isValid = await verifySignature(
        c.env.SENDGRID_WEBHOOK_VERIFICATION_KEY,
        rawBody,
        signature,
        timestamp,
      )

      if (!isValid) {
        return c.json({ error: 'Invalid signature' }, 401)
      }

      // re-parse the body since we consumed it
      const events = v.safeParse(
        SendGridWebhookPayloadSchema,
        JSON.parse(rawBody),
      )
      if (!events.success) {
        logger.warn('Invalid SendGrid webhook payload', {
          issues: events.issues,
        })
        return c.json({ error: 'Invalid payload' }, 400)
      }

      await processEvents(c.var.db, events.output)
    } else {
      // no signature verification, just parse JSON directly
      const body = await c.req.json()
      const events = v.safeParse(SendGridWebhookPayloadSchema, body)
      if (!events.success) {
        logger.warn('Invalid SendGrid webhook payload', {
          issues: events.issues,
        })
        return c.json({ error: 'Invalid payload' }, 400)
      }

      await processEvents(c.var.db, events.output)
    }

    return c.json({ ok: true })
  })

async function processEvents(
  db: Parameters<typeof injectDb>[0]['var']['db'],
  events: v.InferOutput<typeof SendGridWebhookPayloadSchema>,
) {
  for (const event of events) {
    const channel = await db.query.userChannels.findFirst({
      where: eq(TABLE.userChannels.target, event.email),
    })

    if (!channel) {
      logger.warn('SendGrid event for unknown email', {
        email: event.email,
        event: event.event,
      })
      continue
    }

    switch (event.event) {
      case 'bounce':
      case 'dropped':
        // mark as bounced
        await db
          .update(TABLE.userChannels)
          .set({
            status: 'bounced',
            status_reason:
              event.reason ?? `${event.event}: ${event.type ?? 'unknown'}`,
            last_bounce_at: new Date(event.timestamp * 1000),
          })
          .where(eq(TABLE.userChannels.id, channel.id))

        logger.info('Email channel marked as bounced', {
          channelId: channel.id,
          email: event.email,
          reason: event.reason,
        })
        break

      case 'spamreport':
        // mark as bounced (spam is a delivery failure)
        await db
          .update(TABLE.userChannels)
          .set({
            status: 'bounced',
            status_reason: 'User reported as spam',
            last_bounce_at: new Date(event.timestamp * 1000),
          })
          .where(eq(TABLE.userChannels.id, channel.id))

        logger.info('Email channel marked as bounced (spam report)', {
          channelId: channel.id,
          email: event.email,
        })
        break

      case 'unsubscribe':
      case 'group_unsubscribe':
        // mark as unsubscribed
        await db
          .update(TABLE.userChannels)
          .set({
            status: 'unsubscribed',
            status_reason: 'User unsubscribed via email link',
          })
          .where(eq(TABLE.userChannels.id, channel.id))

        logger.info('Email channel marked as unsubscribed', {
          channelId: channel.id,
          email: event.email,
        })
        break
    }
  }
}
