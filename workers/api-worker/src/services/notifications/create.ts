import {
  getFirstOrFallback,
  ResultFn,
  TaggedError,
} from '@ens-apps/utils/neverthrow'
import { and, eq } from 'drizzle-orm'
import { err, ok } from 'neverthrow'
import {
  channelSupportsNotification,
  type NotificationKind,
  type NotificationPayloads,
} from '#config/notifications.js'
import { type Database, intoDbResult, TABLE } from '#core/database/index.js'
import type { EmailDeliveryJob, TelegramDeliveryJob } from '#types/delivery.js'
import { logger } from '#utils/logger.js'

type CreateNotificationContext = {
  db: Database
  telegramQueue: Queue
  emailQueue: Queue
}

class NotificationCreationError extends TaggedError(
  'NOTIFICATION_CREATION_ERROR',
)<{}> {}

export const createNotification = ResultFn(async function* <
  K extends NotificationKind,
>(ctx: {
  env: CloudflareBindings
  db: Database
  userId: string
  kind: K
  payload: NotificationPayloads[K]
  idempotencyKey: string
}) {
  // Create the notification record
  const notification = yield* intoDbResult(
    ctx.db
      .insert(TABLE.notifications)
      .values({
        user_id: ctx.userId,
        kind: ctx.kind,
        payload: ctx.payload as any,
        idempotency_key: ctx.idempotencyKey,
      })
      .returning(),
  ).andThen(
    getFirstOrFallback(() =>
      new NotificationCreationError({
        message: 'Failed to create notification',
      }).toErr(),
    ),
  )

  // Get user's verified channels
  const channels = yield* intoDbResult(
    ctx.db.query.userChannels.findMany({
      where: and(
        eq(TABLE.userChannels.user_id, ctx.userId),
        eq(TABLE.userChannels.status, 'verified'),
      ),
    }),
  )

  // Get user preferences
  const prefs = yield* intoDbResult(
    ctx.db.query.notificationPreferences.findMany({
      where: and(
        eq(TABLE.notificationPreferences.user_id, ctx.userId),
        eq(TABLE.notificationPreferences.kind, ctx.kind),
      ),
    }),
  )

  // Queue delivery for each enabled channel
  for (const channel of channels) {
    // Check if channel supports this notification type
    if (!channelSupportsNotification(channel.channel, ctx.kind)) {
      logger.debug('Channel does not support notification', {
        channel: channel.channel,
        kind: ctx.kind,
      })
      continue
    }

    // Check user preference (default: enabled)
    const pref = prefs.find((p) => p.channel === channel.channel)
    const isEnabled = pref?.enabled ?? true

    if (!isEnabled) {
      logger.debug('User disabled notification for channel', {
        channel: channel.channel,
        kind: ctx.kind,
      })
      continue
    }

    // Create delivery record
    const delivery = yield* intoDbResult(
      ctx.db
        .insert(TABLE.notificationDeliveries)
        .values({
          notification_id: notification.id,
          channel: channel.channel,
          target: channel.target!,
          status: 'queued',
          attempts: 0,
        })
        .returning(),
    ).andThen(
      getFirstOrFallback(
        new NotificationCreationError({
          message: 'Failed to create delivery',
        }).toErr(),
      ),
    )

    // Enqueue based on channel type
    switch (channel.channel) {
      case 'telegram': {
        const job: TelegramDeliveryJob = {
          id: delivery.id,
          notificationId: notification.id,
          userId: ctx.userId,
          channel: 'telegram',
          target: channel.target!,
          kind: ctx.kind,
          payload: ctx.payload,
          attempts: 0,
          maxAttempts: 3,
        }
        await ctx.env.TELEGRAM_QUEUE.send(job)
        break
      }

      case 'email': {
        const job: EmailDeliveryJob = {
          id: delivery.id,
          notificationId: notification.id,
          userId: ctx.userId,
          channel: 'email',
          target: channel.target!,
          kind: ctx.kind,
          payload: ctx.payload,
          attempts: 0,
          maxAttempts: 3,
        }
        await ctx.env.EMAIL_QUEUE.send(job)
        break
      }

      // Add other channels as needed
    }

    logger.info('Delivery job queued', {
      deliveryId: delivery.id,
      channel: channel.channel,
      kind: ctx.kind,
    })
  }

  return ok(notification)
})
