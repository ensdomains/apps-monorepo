import { and, eq } from 'drizzle-orm'
import * as v from 'valibot'
import { createApp } from '#app/middleware/hono.js'
import { getCrossmintDb } from '#core/database/crossmint.js'
import { crossmintOrders } from '#core/database/schema/crossmint.js'
import {
  CrossmintWebhookEventSchema,
  getClientReference,
  PAYMENT_SUCCEEDED_EVENT,
  type RegistrationJob,
} from '#services/crossmint/types.js'
import { logger } from '#utils/logger.js'

const WebhookRawBodySchema = v.pipe(
  v.string(),
  v.parseJson(),
  CrossmintWebhookEventSchema,
)

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function bytesToBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

/**
 * Verify a Svix-signed Crossmint webhook.
 * https://docs.crossmint.com/introduction/platform/webhooks/verify-webhooks
 *
 * signed content = `${svix-id}.${svix-timestamp}.${rawBody}`, HMAC-SHA256 with
 * the base64 secret (after the `whsec_` prefix), compared to any `v1,<sig>` in
 * the space-separated `svix-signature` header.
 */
async function verifySvixSignature(
  secret: string,
  headers: { id: string; timestamp: string; signature: string },
  rawBody: string,
): Promise<boolean> {
  const secretBytes = base64ToBytes(secret.replace(/^whsec_/, ''))
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedContent),
  )
  const expected = bytesToBase64(mac)
  // Header is a space-separated list of `version,signature` pairs.
  return headers.signature
    .split(' ')
    .map((part) => part.split(',')[1])
    .some((sig) => sig === expected)
}

export default createApp()
  .basePath('/crossmint')
  .post('/', async (c) => {
    const rawBody = await c.req.text()
    const db = getCrossmintDb(c.env)

    // Fail closed: an unsigned "payment succeeded" claim must never flip an
    // order to paid. Without the Svix secret this endpoint is an open switch
    // that lets anyone trigger Safe spending for an unpaid order. Local dev
    // can opt in explicitly; self-pay doesn't need this endpoint at all (it
    // settles via /crossmint/voucher/orders/:id/settle with on-chain proof).
    if (c.env.CROSSMINT_WEBHOOK_SECRET) {
      const id = c.req.header('svix-id')
      const timestamp = c.req.header('svix-timestamp')
      const signature = c.req.header('svix-signature')
      if (!id || !timestamp || !signature) {
        return c.json({ error: 'Missing signature headers' }, 401)
      }
      const valid = await verifySvixSignature(
        c.env.CROSSMINT_WEBHOOK_SECRET,
        { id, timestamp, signature },
        rawBody,
      )
      if (!valid) {
        logger.warn('Crossmint webhook signature verification failed')
        return c.json({ error: 'Invalid signature' }, 401)
      }
    } else if (c.env.ALLOW_UNSIGNED_WEBHOOK !== 'true') {
      logger.warn('Crossmint webhook rejected: no CROSSMINT_WEBHOOK_SECRET')
      return c.json({ error: 'Webhook signing not configured' }, 503)
    }

    const parsed = v.safeParse(WebhookRawBodySchema, rawBody)
    if (!parsed.success) {
      logger.warn('Invalid Crossmint webhook payload', {
        issues: parsed.issues,
      })
      return c.json({ error: 'Invalid payload' }, 400)
    }
    const event = parsed.output

    // Only settled payments trigger fulfilment; ack everything else.
    if (event.type !== PAYMENT_SUCCEEDED_EVENT) {
      return c.json({ ok: true, ignored: event.type })
    }

    const clientReference = getClientReference(event)
    if (!clientReference) {
      logger.warn('Crossmint payment webhook missing clientReference', {
        orderId: event.data.orderId,
      })
      return c.json({ error: 'Missing clientReference' }, 400)
    }

    // Idempotent: only a pending order flips to paid + enqueues. Webhook
    // redeliveries (or an order already in-flight) match 0 rows and no-op.
    const updated = await db
      .update(crossmintOrders)
      .set({
        status: 'paid',
        crossmint_order_id: event.data.orderId ?? null,
        voucher_token_id: event.data.voucherTokenId ?? null,
        amount_paid: event.data.amountPaid ?? null,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(crossmintOrders.id, clientReference),
          eq(crossmintOrders.status, 'pending'),
        ),
      )
      .returning({ id: crossmintOrders.id })

    if (updated.length === 0) {
      logger.info(
        'Crossmint webhook: order not pending (duplicate or unknown)',
        {
          clientReference,
        },
      )
      return c.json({ ok: true, duplicate: true })
    }

    await c.env.REGISTRATION_QUEUE.send({
      orderId: clientReference,
      phase: 'commit',
    } satisfies RegistrationJob)

    logger.info('Crossmint payment received, registration enqueued', {
      orderId: clientReference,
    })
    return c.json({ ok: true })
  })
