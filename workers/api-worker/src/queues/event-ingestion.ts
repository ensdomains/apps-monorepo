import {
  channelSupportsNotification,
  type PersonalNotificationKind,
} from '@ens-apps/shared-schema/notifications'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { and, asc, eq, gt, inArray } from 'drizzle-orm'
import { err, fromPromise, ok, type Result } from 'neverthrow'
import * as v from 'valibot'
import {
  type Database,
  getDatabase,
  intoDbResult,
  TABLE,
} from '#core/database/index.js'
import type { BaseDeliveryJob } from '#types/delivery.js'
import { type ExpiryEvent, expiryEventSchema } from '#types/events/index.js'
import { chunk } from '#utils/chunk.js'
import { logger } from '#utils/logger.js'

const CHANNEL_TO_QUEUE: Partial<Record<string, keyof CloudflareBindings>> = {
  telegram: 'TELEGRAM_QUEUE',
  email: 'EMAIL_QUEUE',
  push: 'PUSH_QUEUE',
}

export const RECIPIENT_PAGE_SIZE = 500
export const DATABASE_WRITE_BATCH_SIZE = 500
export const QUEUE_BATCH_SIZE = 95
const QUEUE_SEND_MAX_RETRIES = 3
const QUEUE_SEND_BASE_DELAY_MS = 300

class EventIngestionProcessingError extends TaggedError(
  'EVENT_INGESTION_PROCESSING_ERROR',
) {}

class EventIngestionReconciliationError extends TaggedError(
  'EVENT_INGESTION_RECONCILIATION_ERROR',
)<{
  readonly missingCount?: number
  readonly notificationId?: string
  readonly deliveryId?: string
}> {}

const toQueueRetryDelayMs = (attempt: number): number => {
  const jitter = Math.floor(Math.random() * 100)
  return QUEUE_SEND_BASE_DELAY_MS * 2 ** (attempt - 1) + jitter
}

const wait = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

type WatchReason = 'owned' | 'favourited' | 'manual'

type NotificationSettings = {
  readonly owned_name_expiry: boolean
  readonly favourited_name_expiry: boolean
}

type Recipient = {
  readonly userId: string
  readonly watchReason: WatchReason
}

type ReconciledNotification = {
  readonly id: string
  readonly user_id: string
  readonly kind: PersonalNotificationKind
  readonly payload: unknown
  readonly idempotency_key: string
}

type DesiredDelivery = {
  readonly notificationId: string
  readonly channel: 'email' | 'push' | 'telegram'
  readonly target: string
}

type ReconciledDelivery = DesiredDelivery & {
  readonly id: string
  readonly status: 'queued' | 'delivered' | 'failed' | 'permanently_failed'
}

type VerifiedChannel = {
  readonly channel: 'email' | 'push' | 'telegram'
  readonly target: string | null
}

type DeliveryFanout = {
  readonly deliveries: readonly DesiredDelivery[]
  readonly isSuppressedBySettings: boolean
  readonly unsupportedChannelCount: number
  readonly missingTargetCount: number
  readonly missingQueueBindingCount: number
}

type StageCounts = Partial<Record<ExpiryEvent['stage'], number>>

const countByStage = (events: readonly ExpiryEvent[]): StageCounts => {
  const counts: StageCounts = {}
  for (const event of events) {
    counts[event.stage] = (counts[event.stage] ?? 0) + 1
  }
  return counts
}

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

const getNotificationWatchReason = (
  notification: ReconciledNotification,
): Result<WatchReason, EventIngestionReconciliationError> => {
  if (!notification.payload || typeof notification.payload !== 'object') {
    return err(
      new EventIngestionReconciliationError({
        message: 'Reconciled notification has an invalid expiry payload',
        notificationId: notification.id,
      }),
    )
  }

  const payload = notification.payload as {
    readonly isOwner?: unknown
    readonly watchReason?: unknown
  }

  if (
    payload.watchReason === 'owned' ||
    payload.watchReason === 'favourited' ||
    payload.watchReason === 'manual'
  ) {
    return ok(payload.watchReason)
  }

  if (typeof payload.isOwner === 'boolean') {
    return ok(payload.isOwner ? 'owned' : 'favourited')
  }

  return err(
    new EventIngestionReconciliationError({
      message: 'Reconciled notification has an invalid expiry payload',
      notificationId: notification.id,
    }),
  )
}

const deliveryIdentity = (delivery: DesiredDelivery): string =>
  JSON.stringify([delivery.notificationId, delivery.channel, delivery.target])

const getNotificationDeliveryFanout = ResultFn(function* (ctx: {
  readonly notification: ReconciledNotification
  readonly channels: readonly VerifiedChannel[]
  readonly settings: NotificationSettings
}) {
  if (ctx.notification.kind !== 'name-expiry') {
    yield* new EventIngestionReconciliationError({
      message: 'Reconciled notification has an unexpected kind',
      notificationId: ctx.notification.id,
    })
  }

  const watchReason = yield* getNotificationWatchReason(ctx.notification)
  if (!shouldCreateExternalDeliveries(watchReason, ctx.settings)) {
    return ok({
      deliveries: [],
      isSuppressedBySettings: true,
      unsupportedChannelCount: 0,
      missingTargetCount: 0,
      missingQueueBindingCount: 0,
    } satisfies DeliveryFanout)
  }

  const deliveries: DesiredDelivery[] = []
  let unsupportedChannelCount = 0
  let missingTargetCount = 0
  let missingQueueBindingCount = 0

  for (const channel of ctx.channels) {
    if (!channelSupportsNotification(channel.channel, 'name-expiry')) {
      unsupportedChannelCount += 1
      continue
    }

    if (!channel.target) {
      missingTargetCount += 1
      continue
    }

    if (!CHANNEL_TO_QUEUE[channel.channel]) {
      missingQueueBindingCount += 1
      continue
    }

    deliveries.push({
      notificationId: ctx.notification.id,
      channel: channel.channel,
      target: channel.target,
    })
  }

  return ok({
    deliveries,
    isSuppressedBySettings: false,
    unsupportedChannelCount,
    missingTargetCount,
    missingQueueBindingCount,
  } satisfies DeliveryFanout)
})

const sendQueueJobs = ResultFn(async function* (ctx: {
  readonly queueBinding: keyof CloudflareBindings
  readonly queue: Queue<BaseDeliveryJob>
  readonly jobs: readonly BaseDeliveryJob[]
}) {
  const jobChunks = chunk([...ctx.jobs], QUEUE_BATCH_SIZE)

  logger.debug('Enqueueing delivery jobs', {
    queue: ctx.queueBinding,
    jobCount: ctx.jobs.length,
    chunkCount: jobChunks.length,
  })

  for (const [chunkIndex, jobChunk] of jobChunks.entries()) {
    for (let attempt = 1; attempt <= QUEUE_SEND_MAX_RETRIES; attempt++) {
      const sendResult = await fromPromise(
        ctx.queue.sendBatch(jobChunk.map((job) => ({ body: job }))),
        (cause: unknown) =>
          new EventIngestionProcessingError({
            message: `Failed to enqueue ${ctx.queueBinding} delivery jobs`,
            cause,
          }),
      )

      if (sendResult.isOk()) {
        break
      }

      if (attempt === QUEUE_SEND_MAX_RETRIES) {
        logger.error('Queue send failed after retries', {
          queue: ctx.queueBinding,
          chunkIndex,
          chunkSize: jobChunk.length,
          maxRetries: QUEUE_SEND_MAX_RETRIES,
          error: sendResult.error,
        })
        yield* sendResult
      }

      const delayMs = toQueueRetryDelayMs(attempt)
      logger.warn('Queue send failed, retrying chunk', {
        queue: ctx.queueBinding,
        chunkIndex,
        chunkSize: jobChunk.length,
        attempt,
        maxRetries: QUEUE_SEND_MAX_RETRIES,
        delayMs,
        error: sendResult.error,
      })
      await wait(delayMs)
    }
  }

  return ok(undefined)
})

const reconcileNotifications = ResultFn(async function* (ctx: {
  readonly db: Database
  readonly event: ExpiryEvent
  readonly recipients: readonly Recipient[]
}) {
  const desiredNotifications = ctx.recipients.map((recipient) => ({
    user_id: recipient.userId,
    kind: 'name-expiry' as const,
    payload: {
      name: ctx.event.name,
      expiryDate: ctx.event.expiryDate * 1000,
      isOwner: recipient.watchReason === 'owned',
      watchReason: recipient.watchReason,
    },
    idempotency_key: buildIdempotencyKey(ctx.event, recipient.userId),
  }))
  const reconciledNotifications: ReconciledNotification[] = []

  for (const notificationChunk of chunk(
    desiredNotifications,
    DATABASE_WRITE_BATCH_SIZE,
  )) {
    const idempotencyKeys = notificationChunk.map(
      (notification) => notification.idempotency_key,
    )
    const insertQuery = ctx.db
      .insert(TABLE.notifications)
      .values(notificationChunk)
      .onConflictDoNothing({
        target: TABLE.notifications.idempotency_key,
      })
    const reconcileQuery = ctx.db.query.notifications.findMany({
      where: inArray(TABLE.notifications.idempotency_key, idempotencyKeys),
      columns: {
        id: true,
        user_id: true,
        kind: true,
        payload: true,
        idempotency_key: true,
      },
    })
    const [, reconciledChunk] = yield* intoDbResult(
      ctx.db.batch([insertQuery, reconcileQuery]),
    )
    reconciledNotifications.push(
      ...(reconciledChunk as ReconciledNotification[]),
    )
  }

  const reconciledKeys = new Set(
    reconciledNotifications.map((notification) => notification.idempotency_key),
  )
  const missingKeys = desiredNotifications
    .map((notification) => notification.idempotency_key)
    .filter((idempotencyKey) => !reconciledKeys.has(idempotencyKey))

  if (missingKeys.length > 0) {
    yield* new EventIngestionReconciliationError({
      message: 'Required notifications could not be reconciled',
      missingCount: missingKeys.length,
    })
  }

  return ok(reconciledNotifications)
})

const deriveDesiredDeliveries = ResultFn(async function* (ctx: {
  readonly db: Database
  readonly notifications: readonly ReconciledNotification[]
}) {
  const userIds = Array.from(
    new Set(ctx.notifications.map((notification) => notification.user_id)),
  )
  const channelsQuery = ctx.db.query.userChannels.findMany({
    where: and(
      inArray(TABLE.userChannels.user_id, userIds),
      eq(TABLE.userChannels.status, 'verified'),
    ),
    columns: {
      user_id: true,
      channel: true,
      target: true,
    },
  })
  const settingsQuery = ctx.db.query.userNotificationSettings.findMany({
    where: inArray(TABLE.userNotificationSettings.user_id, userIds),
    columns: {
      user_id: true,
      owned_name_expiry: true,
      favourited_name_expiry: true,
    },
  })
  const [channels, settingsRows] = yield* intoDbResult(
    ctx.db.batch([channelsQuery, settingsQuery]),
  )
  const channelsByUserId = Map.groupBy(channels, (channel) => channel.user_id)
  const settingsByUserId = new Map(
    settingsRows.map((settings) => [settings.user_id, settings]),
  )
  const desiredDeliveries = new Map<string, DesiredDelivery>()
  let suppressedBySettingsCount = 0
  let unsupportedChannelCount = 0
  let missingTargetCount = 0
  let missingQueueBindingCount = 0

  for (const notification of ctx.notifications) {
    const settings = settingsByUserId.get(notification.user_id)
    const fanout = yield* getNotificationDeliveryFanout({
      notification,
      channels: channelsByUserId.get(notification.user_id) ?? [],
      settings: {
        owned_name_expiry: settings?.owned_name_expiry ?? false,
        favourited_name_expiry: settings?.favourited_name_expiry ?? false,
      },
    })
    suppressedBySettingsCount += fanout.isSuppressedBySettings ? 1 : 0
    unsupportedChannelCount += fanout.unsupportedChannelCount
    missingTargetCount += fanout.missingTargetCount
    missingQueueBindingCount += fanout.missingQueueBindingCount

    for (const delivery of fanout.deliveries) {
      desiredDeliveries.set(deliveryIdentity(delivery), delivery)
    }
  }

  if (suppressedBySettingsCount > 0 || unsupportedChannelCount > 0) {
    logger.debug('Some expiry notifications skipped during delivery fanout', {
      suppressedBySettingsCount,
      unsupportedChannelCount,
    })
  }

  if (missingTargetCount > 0 || missingQueueBindingCount > 0) {
    logger.warn('Delivery fanout encountered channel configuration issues', {
      missingTargetCount,
      missingQueueBindingCount,
    })
  }

  return ok(Array.from(desiredDeliveries.values()))
})

const reconcileDeliveries = ResultFn(async function* (ctx: {
  readonly db: Database
  readonly notifications: readonly ReconciledNotification[]
  readonly desiredDeliveries: readonly DesiredDelivery[]
}) {
  for (const deliveryChunk of chunk(
    [...ctx.desiredDeliveries],
    DATABASE_WRITE_BATCH_SIZE,
  )) {
    yield* intoDbResult(
      ctx.db
        .insert(TABLE.notificationDeliveries)
        .values(
          deliveryChunk.map((delivery) => ({
            notification_id: delivery.notificationId,
            channel: delivery.channel,
            target: delivery.target,
            status: 'queued' as const,
            attempts: 0,
          })),
        )
        .onConflictDoNothing({
          target: [
            TABLE.notificationDeliveries.notification_id,
            TABLE.notificationDeliveries.channel,
            TABLE.notificationDeliveries.target,
          ],
        }),
    )
  }

  if (ctx.desiredDeliveries.length === 0) {
    return ok([] as ReconciledDelivery[])
  }

  const notificationIds = ctx.notifications.map(
    (notification) => notification.id,
  )
  const deliveryRows = yield* intoDbResult(
    ctx.db.query.notificationDeliveries.findMany({
      where: inArray(
        TABLE.notificationDeliveries.notification_id,
        notificationIds,
      ),
      columns: {
        id: true,
        notification_id: true,
        channel: true,
        target: true,
        status: true,
      },
    }),
  )
  const desiredIdentities = new Set(ctx.desiredDeliveries.map(deliveryIdentity))
  const reconciledDeliveries = deliveryRows
    .map(
      (delivery): ReconciledDelivery => ({
        id: delivery.id,
        notificationId: delivery.notification_id,
        channel: delivery.channel,
        target: delivery.target,
        status: delivery.status,
      }),
    )
    .filter((delivery) => desiredIdentities.has(deliveryIdentity(delivery)))
  const reconciledIdentities = new Set(
    reconciledDeliveries.map(deliveryIdentity),
  )
  const missingDeliveries = ctx.desiredDeliveries.filter(
    (delivery) => !reconciledIdentities.has(deliveryIdentity(delivery)),
  )

  if (missingDeliveries.length > 0) {
    yield* new EventIngestionReconciliationError({
      message: 'Required notification deliveries could not be reconciled',
      missingCount: missingDeliveries.length,
    })
  }

  return ok(reconciledDeliveries)
})

export const processRecipientPage = ResultFn(async function* (ctx: {
  readonly db: Database
  readonly env: CloudflareBindings
  readonly event: ExpiryEvent
  readonly recipients: readonly Recipient[]
}) {
  if (ctx.recipients.length === 0) {
    return ok(undefined)
  }

  const notifications = yield* reconcileNotifications({
    db: ctx.db,
    event: ctx.event,
    recipients: ctx.recipients,
  })
  const desiredDeliveries = yield* deriveDesiredDeliveries({
    db: ctx.db,
    notifications,
  })
  const deliveries = yield* reconcileDeliveries({
    db: ctx.db,
    notifications,
    desiredDeliveries,
  })
  const notificationsById = new Map(
    notifications.map((notification) => [notification.id, notification]),
  )
  const jobsByQueue = new Map<keyof CloudflareBindings, BaseDeliveryJob[]>()

  for (const delivery of deliveries) {
    if (delivery.status !== 'queued') {
      continue
    }

    const notification = notificationsById.get(delivery.notificationId)
    const queueBinding = CHANNEL_TO_QUEUE[delivery.channel]
    if (!notification || !queueBinding) {
      yield* new EventIngestionReconciliationError({
        message: 'Reconciled delivery could not be mapped to a queue job',
        deliveryId: delivery.id,
      })
      continue
    }

    const jobs = jobsByQueue.get(queueBinding) ?? []
    jobsByQueue.set(queueBinding, [
      ...jobs,
      {
        id: delivery.id,
        notificationId: notification.id,
        userId: notification.user_id,
        kind: notification.kind,
      },
    ])
  }

  for (const [queueBinding, jobs] of jobsByQueue.entries()) {
    yield* sendQueueJobs({
      queueBinding,
      queue: ctx.env[queueBinding] as Queue<BaseDeliveryJob>,
      jobs,
    })
  }

  logger.debug('Processed expiry recipient page', {
    name: ctx.event.name,
    recipientCount: ctx.recipients.length,
    reconciledNotificationCount: notifications.length,
    desiredDeliveryCount: desiredDeliveries.length,
    reconciledDeliveryCount: deliveries.length,
  })

  return ok(undefined)
})

const processExpiryEvent = ResultFn(async function* (ctx: {
  readonly db: Database
  readonly env: CloudflareBindings
  readonly event: ExpiryEvent
  readonly ownerUserId?: string
}) {
  if (ctx.ownerUserId) {
    yield* processRecipientPage({
      db: ctx.db,
      env: ctx.env,
      event: ctx.event,
      recipients: [{ userId: ctx.ownerUserId, watchReason: 'owned' }],
    })
  }

  if (!ctx.event.includeFavorites) {
    return ok(undefined)
  }

  let favoriteCursor: string | undefined
  let pageCount = 0
  let favoriteRecipientCount = 0

  while (true) {
    const favoritePage = yield* intoDbResult(
      ctx.db.query.favorites.findMany({
        where: and(
          eq(TABLE.favorites.name, ctx.event.name),
          favoriteCursor
            ? gt(TABLE.favorites.user_id, favoriteCursor)
            : undefined,
        ),
        columns: {
          user_id: true,
        },
        orderBy: asc(TABLE.favorites.user_id),
        limit: RECIPIENT_PAGE_SIZE,
      }),
    )

    if (favoritePage.length === 0) {
      break
    }

    const recipients = favoritePage
      .filter((favorite) => favorite.user_id !== ctx.ownerUserId)
      .map(
        (favorite): Recipient => ({
          userId: favorite.user_id,
          watchReason: 'favourited',
        }),
      )

    yield* processRecipientPage({
      db: ctx.db,
      env: ctx.env,
      event: ctx.event,
      recipients,
    })

    pageCount += 1
    favoriteRecipientCount += recipients.length

    if (favoritePage.length < RECIPIENT_PAGE_SIZE) {
      break
    }

    favoriteCursor = favoritePage.at(-1)?.user_id
    if (!favoriteCursor) {
      yield* new EventIngestionReconciliationError({
        message: 'Favorite recipient page did not produce a cursor',
      })
    }
  }

  logger.debug('Processed favourite recipients for expiry event', {
    name: ctx.event.name,
    pageCount,
    recipientCount: favoriteRecipientCount,
  })

  return ok(undefined)
})

const loadOwnerUserIds = ResultFn(async function* (ctx: {
  readonly db: Database
  readonly events: readonly ExpiryEvent[]
}) {
  const ownerAddresses = Array.from(
    new Set(
      ctx.events
        .map((event) => event.owner?.toLowerCase())
        .filter((owner): owner is string => Boolean(owner)),
    ),
  )

  if (ownerAddresses.length === 0) {
    return ok(new Map<string, string>())
  }

  const owners = yield* intoDbResult(
    ctx.db.query.users.findMany({
      where: inArray(TABLE.users.address, ownerAddresses),
      columns: {
        id: true,
        address: true,
      },
    }),
  )

  return ok(
    new Map(owners.map((owner) => [owner.address.toLowerCase(), owner.id])),
  )
})

type ValidExpiryMessage = {
  readonly message: Message
  readonly event: ExpiryEvent
}

type MessageValidationSummary = {
  readonly validMessages: readonly ValidExpiryMessage[]
  readonly invalidShapeCount: number
  readonly unsupportedTypeCount: number
  readonly invalidSchemaCount: number
}

const validateSourceMessages = (
  messages: readonly Message[],
): MessageValidationSummary => {
  const validMessages: ValidExpiryMessage[] = []
  let invalidShapeCount = 0
  let unsupportedTypeCount = 0
  let invalidSchemaCount = 0

  for (const message of messages) {
    const body = message.body

    if (!body || typeof body !== 'object') {
      invalidShapeCount += 1
      message.ack()
      continue
    }

    const eventType = (body as Record<string, unknown>).type
    if (eventType !== 'name_expiring') {
      unsupportedTypeCount += 1
      message.ack()
      continue
    }

    const parsed = v.safeParse(expiryEventSchema, body)
    if (!parsed.success) {
      invalidSchemaCount += 1
      logger.trace('Invalid expiry event payload details', {
        issues: parsed.issues,
      })
      message.ack()
      continue
    }

    validMessages.push({ message, event: parsed.output })
  }

  return {
    validMessages,
    invalidShapeCount,
    unsupportedTypeCount,
    invalidSchemaCount,
  }
}

export const handleEventIngestionQueue = async (
  batch: MessageBatch,
  env: CloudflareBindings,
): Promise<void> => {
  const db = getDatabase(env)
  const {
    validMessages,
    invalidShapeCount,
    unsupportedTypeCount,
    invalidSchemaCount,
  } = validateSourceMessages(batch.messages)

  const droppedCount =
    invalidShapeCount + unsupportedTypeCount + invalidSchemaCount

  if (droppedCount > 0) {
    logger.warn('Dropped non-processable event-ingestion messages', {
      queue: batch.queue,
      messageCount: batch.messages.length,
      validMessageCount: validMessages.length,
      droppedCount,
      invalidShapeCount,
      unsupportedTypeCount,
      invalidSchemaCount,
    })
  }

  if (validMessages.length === 0) {
    return
  }

  const events = validMessages.map(({ event }) => event)
  const stageCounts = countByStage(events)
  logger.info('Processing event-ingestion batch', {
    queue: batch.queue,
    messageCount: batch.messages.length,
    validMessageCount: validMessages.length,
    droppedCount,
    stageCounts,
  })

  const ownerResult = await loadOwnerUserIds({ db, events })
  if (ownerResult.isErr()) {
    logger.error('Failed shared expiry owner lookup', {
      queue: batch.queue,
      validMessageCount: validMessages.length,
      error: ownerResult.error,
    })

    for (const { message } of validMessages) {
      message.retry()
    }
    return
  }

  for (const { message, event } of validMessages) {
    const ownerUserId = event.owner
      ? ownerResult.value.get(event.owner.toLowerCase())
      : undefined
    const result = await processExpiryEvent({
      db,
      env,
      event,
      ownerUserId,
    })

    if (result.isErr()) {
      logger.error('Failed to process expiry event', {
        queue: batch.queue,
        messageId: message.id,
        name: event.name,
        stage: event.stage,
        error: result.error,
      })
      message.retry()
      continue
    }

    message.ack()
  }

  logger.info('Event-ingestion batch completed', {
    queue: batch.queue,
    messageCount: batch.messages.length,
    validMessageCount: validMessages.length,
    droppedCount,
    stageCounts,
  })
}
