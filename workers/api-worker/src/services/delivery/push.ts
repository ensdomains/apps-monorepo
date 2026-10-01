import { buildPushPayload } from '@block65/webcrypto-web-push'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { eq } from 'drizzle-orm'
import { ok } from 'neverthrow'
import type { Database } from '#core/database/index.js'
import { TABLE } from '#core/database/index.js'
import type { PushDeliveryJob } from '#types/delivery.js'
import { logger } from '#utils/logger.js'
import { resolveDeliveryChannel } from './channel.js'
import {
  PushDeliveryError,
  UnsupportedNotificationTypeError,
} from './errors.js'
import { type PushTemplate, pushTemplates } from './templates/push.js'

export const deliverPushNotification = ResultFn(async function* (
  env: {
    VAPID_SUBJECT: string
    VAPID_PUBLIC_KEY: string
    VAPID_PRIVATE_KEY: string
  },
  db: Database,
  job: PushDeliveryJob,
) {
  // 1. resolve the exact source subscription: endpoint and encryption keys
  const delivery = yield* resolveDeliveryChannel(db, job, 'push')
  if (!delivery) return ok(undefined)

  const { channel } = delivery

  // 2. get the template
  const template = pushTemplates[job.kind] as PushTemplate<typeof job.kind>
  if (!template) {
    return yield* new UnsupportedNotificationTypeError({
      message: `No Push template for: ${job.kind}`,
    })
  }

  // 3. generate notification content
  const notificationData = template(delivery.payload)

  // 4. build the Web Push subscription object
  const subscription = {
    endpoint: channel.target,
    expirationTime: channel.data.expirationTime ?? null,
    keys: {
      auth: channel.data.auth,
      p256dh: channel.data.p256dh,
    },
  }

  // 5. build encrypted payload
  const payload = await buildPushPayload(
    {
      data: notificationData,
      options: {
        topic: job.kind,
        ttl: 86400, // 24 hours
        urgency: 'normal' as const,
      },
    },
    subscription,
    {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    },
  )

  // 6. send to push service
  const response = await fetch(subscription.endpoint, payload)

  if (!response.ok) {
    const errorText = await response.text()

    // handle expired subscriptions (410 Gone): only the source subscription is
    // gone, and retrying cannot succeed, so the delivery fails permanently
    if (response.status === 410) {
      await db
        .update(TABLE.userChannels)
        .set({
          status: 'unsubscribed',
          status_reason: 'Push subscription expired',
        })
        .where(eq(TABLE.userChannels.id, channel.id))

      await db
        .update(TABLE.notificationDeliveries)
        .set({
          status: 'permanently_failed',
          failure_category: 'hard_bounce',
          error: `Push delivery failed: ${response.status} ${errorText}`,
          updated_at: new Date(),
        })
        .where(eq(TABLE.notificationDeliveries.id, job.id))

      logger.warn('Push subscription expired, marked as unsubscribed', {
        jobId: job.id,
        channelId: channel.id,
      })

      return ok(undefined)
    }

    return yield* new PushDeliveryError({
      message: `Push delivery failed: ${response.status} ${errorText}`,
    })
  }

  // 7. update delivery record
  await db
    .update(TABLE.notificationDeliveries)
    .set({
      status: 'delivered',
      provider_msg_id: response.headers.get('location') || `push-${Date.now()}`,
      updated_at: new Date(),
    })
    .where(eq(TABLE.notificationDeliveries.id, job.id))

  logger.debug('Push notification delivered', {
    jobId: job.id,
    kind: job.kind,
    channelId: channel.id,
  })

  return ok(undefined)
})

export const handlePushDeliveryFailure = async (
  db: Database,
  message: Message<PushDeliveryJob>,
  errorMessage: string,
): Promise<void> => {
  await db
    .update(TABLE.notificationDeliveries)
    .set({
      status: 'failed',
      error: errorMessage,
      attempts: message.attempts + 1,
      updated_at: new Date(),
    })
    .where(eq(TABLE.notificationDeliveries.id, message.body.id))

  logger.error('Push notification failed', {
    jobId: message.body.id,
    kind: message.body.kind,
    attempts: message.attempts + 1,
    error: errorMessage,
  })
}
