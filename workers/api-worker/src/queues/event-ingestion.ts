import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { and, eq, inArray } from 'drizzle-orm'
import { fromPromise, ok } from 'neverthrow'
import { v7 as uuidv7 } from 'uuid'
import * as v from 'valibot'
import { channelSupportsNotification } from '#config/notifications.js'
import { getDatabase, intoDbResult, TABLE } from '#core/database/index.js'
import type { BaseDeliveryJob } from '#types/delivery.js'
import { type ExpiryEvent, expiryEventSchema } from '#types/events/index.js'
import { chunk } from '#utils/chunk.js'
import { logger, prettifyError } from '#utils/logger.js'

const CHANNEL_TO_QUEUE: Partial<Record<string, keyof CloudflareBindings>> = {
  telegram: 'TELEGRAM_QUEUE',
  email: 'EMAIL_QUEUE',
  push: 'PUSH_QUEUE',
}

const QUEUE_BATCH_SIZE = 95

class EventIngestionProcessingError extends TaggedError(
  'EVENT_INGESTION_PROCESSING_ERROR',
) {}

type WatchReason = 'owned' | 'favourited' | 'manual'

type NotificationSettings = {
  owned_name_expiry: boolean
  favourited_name_expiry: boolean
}

type RecipientMap = Map<string, WatchReason>

export function shouldCreateExternalDeliveries(
  watchReason: WatchReason,
  settings: NotificationSettings,
): boolean {
  switch (watchReason) {
    case 'owned':
      return settings.owned_name_expiry
    case 'favourited':
      return settings.favourited_name_expiry
    case 'manual':
      return settings.owned_name_expiry || settings.favourited_name_expiry
  }
}

export function buildIdempotencyKey(
  event: ExpiryEvent,
  userId: string,
): string {
  return `name-expiry:${userId}:${event.name}:${event.stage}:${event.expiryDate}`
}

export function collectRecipientsForEvent(
  event: ExpiryEvent,
  ownerToUserId: Map<string, string>,
  favoriteUsersByName: Map<string, Set<string>>,
): RecipientMap {
  const recipients: RecipientMap = new Map()

  if (event.owner) {
    const ownerUserId = ownerToUserId.get(event.owner.toLowerCase())
    if (ownerUserId) {
      recipients.set(ownerUserId, 'owned')
    }
  }

  if (!event.includeFavorites) {
    return recipients
  }

  const favoriteUserIds = favoriteUsersByName.get(event.name)
  if (!favoriteUserIds) {
    return recipients
  }

  for (const favoriteUserId of favoriteUserIds) {
    // Owner notifications have higher priority than favourites when a user is both.
    if (!recipients.has(favoriteUserId)) {
      recipients.set(favoriteUserId, 'favourited')
    }
  }

  return recipients
}

const processExpiryEvents = ResultFn(async function* (ctx: {
  env: CloudflareBindings
  events: ExpiryEvent[]
}) {
  if (ctx.events.length === 0) {
    return ok(undefined)
  }

  const db = getDatabase(ctx.env)

  logger.debug('Processing expiry events', {
    eventCount: ctx.events.length,
  })

  // Resolve recipients in two set-based lookups to avoid per-event DB round trips.
  const ownerAddresses = Array.from(
    new Set(
      ctx.events
        .map((event) => event.owner?.toLowerCase())
        .filter((owner): owner is string => Boolean(owner)),
    ),
  )

  const favoriteNames = Array.from(
    new Set(
      ctx.events
        .filter((event) => event.includeFavorites)
        .map((event) => event.name),
    ),
  )

  logger.trace('Resolved event lookup keys', {
    ownerAddressCount: ownerAddresses.length,
    favoriteNameCount: favoriteNames.length,
  })

  const owners =
    ownerAddresses.length > 0
      ? yield* intoDbResult(
          db.query.users.findMany({
            where: inArray(TABLE.users.address, ownerAddresses),
            columns: {
              id: true,
              address: true,
            },
          }),
        )
      : []

  const favorites =
    favoriteNames.length > 0
      ? yield* intoDbResult(
          db.query.favorites.findMany({
            where: inArray(TABLE.favorites.name, favoriteNames),
            columns: {
              user_id: true,
              name: true,
            },
          }),
        )
      : []

  logger.trace('Loaded recipient source records', {
    ownerCount: owners.length,
    favoriteCount: favorites.length,
  })

  const ownerToUserId = new Map(
    owners.map((owner) => [owner.address.toLowerCase(), owner.id]),
  )

  const favoriteUsersByName = new Map<string, Set<string>>()
  for (const favorite of favorites) {
    if (!favoriteUsersByName.has(favorite.name)) {
      favoriteUsersByName.set(favorite.name, new Set())
    }

    favoriteUsersByName.get(favorite.name)?.add(favorite.user_id)
  }

  const notificationsToInsert: (typeof TABLE.notifications.$inferInsert)[] = []
  const existingIdempotencyKeys = new Set<string>()

  for (const event of ctx.events) {
    const recipients = collectRecipientsForEvent(
      event,
      ownerToUserId,
      favoriteUsersByName,
    )

    logger.trace('Resolved event recipients', {
      name: event.name,
      recipientCount: recipients.size,
    })

    for (const [userId, watchReason] of recipients.entries()) {
      const idempotencyKey = buildIdempotencyKey(event, userId)

      // Dedupe inside the same queue batch before relying on DB conflict handling.
      if (existingIdempotencyKeys.has(idempotencyKey)) {
        logger.debug('Skipping duplicate idempotency key', {
          idempotencyKey,
        })
        continue
      }

      existingIdempotencyKeys.add(idempotencyKey)

      logger.trace('Adding notification to insert list', {
        userId,
        watchReason,
        idempotencyKey,
      })

      notificationsToInsert.push({
        user_id: userId,
        kind: 'name-expiry',
        payload: {
          name: event.name,
          expiryDate: event.expiryDate * 1000,
          isOwner: watchReason === 'owned',
          watchReason,
        },
        idempotency_key: idempotencyKey,
      })
    }
  }

  if (notificationsToInsert.length === 0) {
    logger.debug('No recipients found for expiry events', {
      eventCount: ctx.events.length,
    })
    return ok(undefined)
  }

  logger.debug('Inserting notifications', {
    count: notificationsToInsert.length,
  })

  const insertedNotifications = yield* intoDbResult(
    db
      .insert(TABLE.notifications)
      .values(notificationsToInsert)
      .onConflictDoNothing({
        target: TABLE.notifications.idempotency_key,
      })
      .returning({
        id: TABLE.notifications.id,
        user_id: TABLE.notifications.user_id,
        kind: TABLE.notifications.kind,
        payload: TABLE.notifications.payload,
      }),
  )

  logger.debug('Inserted notifications', {
    count: insertedNotifications.length,
  })

  if (insertedNotifications.length === 0) {
    logger.debug('All notifications already exist (idempotency conflict)', {
      eventCount: ctx.events.length,
    })
    return ok(undefined)
  }

  const insertedUserIds = Array.from(
    new Set(insertedNotifications.map((notification) => notification.user_id)),
  )

  const channels = yield* intoDbResult(
    db.query.userChannels.findMany({
      where: and(
        inArray(TABLE.userChannels.user_id, insertedUserIds),
        eq(TABLE.userChannels.status, 'verified'),
      ),
      columns: {
        user_id: true,
        channel: true,
        target: true,
      },
    }),
  )

  logger.debug('Loaded user channels for deliveries', {
    userCount: insertedUserIds.length,
    channelCount: channels.length,
  })

  const settingsRows = yield* intoDbResult(
    db.query.userNotificationSettings.findMany({
      where: inArray(TABLE.userNotificationSettings.user_id, insertedUserIds),
      columns: {
        user_id: true,
        owned_name_expiry: true,
        favourited_name_expiry: true,
      },
    }),
  )

  logger.debug('Loaded user notification settings', {
    userCount: settingsRows.length,
  })

  const channelsByUserId = Map.groupBy(channels, (channel) => channel.user_id)
  const settingsByUserId = new Map(
    settingsRows.map((row) => [row.user_id, row]),
  )

  logger.trace('Mapped settings by user ID', {
    userCount: settingsByUserId.size,
  })

  const deliveriesToInsert: (typeof TABLE.notificationDeliveries.$inferInsert)[] =
    []
  const jobsByQueue = new Map<keyof CloudflareBindings, BaseDeliveryJob[]>()
  let deliveryCounter = 0

  for (const notification of insertedNotifications) {
    const payload = notification.payload as {
      watchReason?: WatchReason
      isOwner: boolean
    }

    const watchReason: WatchReason =
      payload.watchReason ?? (payload.isOwner ? 'owned' : 'favourited')

    const settings = settingsByUserId.get(notification.user_id)
    const shouldCreate = shouldCreateExternalDeliveries(watchReason, {
      owned_name_expiry: settings?.owned_name_expiry ?? false,
      favourited_name_expiry: settings?.favourited_name_expiry ?? false,
    })

    if (!shouldCreate) {
      continue
    }

    const userChannels = channelsByUserId.get(notification.user_id) ?? []

    for (const channel of userChannels) {
      if (!channelSupportsNotification(channel.channel, 'name-expiry')) {
        continue
      }

      if (!channel.target) {
        logger.warn(
          'Skipping delivery because verified channel has no target',
          {
            channel: channel.channel,
            userId: notification.user_id,
            notificationId: notification.id,
          },
        )
        continue
      }

      const queueBinding = CHANNEL_TO_QUEUE[channel.channel]
      if (!queueBinding) {
        logger.warn('No queue binding configured for channel', {
          channel: channel.channel,
          notificationId: notification.id,
        })
        continue
      }

      const deliveryId = uuidv7({ seq: deliveryCounter++ })
      deliveriesToInsert.push({
        id: deliveryId,
        notification_id: notification.id,
        channel: channel.channel,
        target: channel.target,
        status: 'queued',
        attempts: 0,
      })

      if (!jobsByQueue.has(queueBinding)) {
        jobsByQueue.set(queueBinding, [])
      }

      jobsByQueue.get(queueBinding)?.push({
        id: deliveryId,
        notificationId: notification.id,
        userId: notification.user_id,
        kind: notification.kind,
      })
    }
  }

  if (deliveriesToInsert.length > 0) {
    yield* intoDbResult(
      db.insert(TABLE.notificationDeliveries).values(deliveriesToInsert),
    )
  }

  for (const [queueBinding, jobs] of jobsByQueue.entries()) {
    const queue = ctx.env[queueBinding] as Queue<BaseDeliveryJob>
    const jobChunks = chunk(jobs, QUEUE_BATCH_SIZE)

    logger.debug('Enqueueing delivery jobs', {
      queue: queueBinding,
      jobCount: jobs.length,
      chunkCount: jobChunks.length,
    })

    for (const jobChunk of jobChunks) {
      // Keep below Cloudflare sendBatch limit (100) with a small headroom.
      yield* fromPromise(
        queue.sendBatch(jobChunk.map((job) => ({ body: job }))),
        (error: unknown) =>
          new EventIngestionProcessingError({
            message: `Failed to enqueue ${queueBinding} delivery jobs`,
            cause: error,
          }),
      )
    }
  }

  logger.info('Processed expiry event batch', {
    eventCount: ctx.events.length,
    insertedNotifications: insertedNotifications.length,
    createdDeliveries: deliveriesToInsert.length,
  })

  return ok(undefined)
})

export const handleEventIngestionQueue = async (
  batch: MessageBatch,
  env: CloudflareBindings,
): Promise<void> => {
  const validMessages: Array<{ message: Message; event: ExpiryEvent }> = []

  for (const message of batch.messages) {
    const body = message.body

    if (!body || typeof body !== 'object') {
      logger.warn('Unsupported event payload shape', {
        bodyType: typeof body,
      })
      message.ack()
      continue
    }

    const eventType = (body as Record<string, unknown>).type
    if (eventType !== 'name_expiring') {
      logger.warn('Unsupported event type', { type: eventType })
      message.ack()
      continue
    }

    // Invalid schema is treated as a permanent poison message: ack and log.
    const parsed = v.safeParse(expiryEventSchema, body)
    if (!parsed.success) {
      logger.warn('Invalid expiry event payload', {
        issues: parsed.issues,
      })
      message.ack()
      continue
    }

    validMessages.push({
      message,
      event: parsed.output,
    })
  }

  if (validMessages.length === 0) {
    return
  }

  logger.info('Processing event-ingestion batch', {
    validMessageCount: validMessages.length,
  })
  logger.debug('Event-ingestion batch names', {
    eventNames: [...new Set(validMessages.map((m) => m.event.name))],
  })

  const result = await processExpiryEvents({
    env,
    events: validMessages.map(({ event }) => event),
  })

  if (result.isErr()) {
    logger.error('Failed to process event-ingestion queue batch', {
      queue: batch.queue,
      messageCount: validMessages.length,
      error: prettifyError(result.error),
    })

    for (const { message } of validMessages) {
      message.retry()
    }

    return
  }

  for (const { message } of validMessages) {
    message.ack()
  }

  logger.info('Event-ingestion batch completed', {
    messageCount: validMessages.length,
  })
}
