import type {
  AnyPersonalNotificationPayload,
  ChannelData,
} from '@ens-apps/shared-schema/notifications'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { ok } from 'neverthrow'
import {
  type Database,
  type DatabaseError,
  intoDbResult,
  TABLE,
} from '#core/database/index.js'
import type { DeliveryStatus } from '#core/database/schema/notifications.js'
import type { BaseDeliveryJob } from '#types/delivery.js'
import { logger } from '#utils/logger.js'
import { NotificationDeliveryNotFoundError } from './errors.js'

type DeliveryChannelType = 'email' | 'push' | 'telegram'

type SourceChannel = {
  readonly id: string
  readonly channel: DeliveryChannelType
  readonly target: string | null
  readonly data: unknown
  readonly status: string
}

export type DeliverableChannel<C extends DeliveryChannelType> = {
  readonly id: string
  readonly target: string
  readonly data: ChannelData[C]
}

const TERMINAL_DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  'delivered',
  'permanently_failed',
  'cancelled',
]

export const isTerminalDeliveryStatus = (status: DeliveryStatus): boolean =>
  TERMINAL_DELIVERY_STATUSES.includes(status)

/** Fanout and send-time both treat a lapsed push subscription as unusable. */
export const isPushSubscriptionActive = (
  data: ChannelData['push'] | null,
  now: number,
): boolean => {
  const expirationTime = data?.expirationTime ?? null
  return expirationTime === null || expirationTime > now
}

type QueuedDeliveryInput = {
  readonly notificationId: string
  readonly channelId: string
  readonly channel: DeliveryChannelType
}

const isForeignKeyViolation = (error: DatabaseError) =>
  (error.cause.cause as { code?: string } | undefined)?.code === '23503'

const insertDeliveries = (
  db: Database,
  deliveries: readonly QueuedDeliveryInput[],
) =>
  intoDbResult(
    db
      .insert(TABLE.notificationDeliveries)
      .values(
        deliveries.map((delivery) => ({
          notification_id: delivery.notificationId,
          channel_id: delivery.channelId,
          channel: delivery.channel,
          status: 'queued' as const,
          attempts: 0,
        })),
      )
      .onConflictDoNothing({
        target: [
          TABLE.notificationDeliveries.notification_id,
          TABLE.notificationDeliveries.channel_id,
        ],
      })
      .returning({
        id: TABLE.notificationDeliveries.id,
        notification_id: TABLE.notificationDeliveries.notification_id,
        channel_id: TABLE.notificationDeliveries.channel_id,
      }),
  )

/**
 * Inserts queued deliveries, leaving existing deliveries for the same
 * notification and channel untouched. A channel removed after it was read
 * fails the foreign key; the insert is then repeated for the channels that
 * remain, so one removal does not fail the whole batch. Returns inserted rows.
 */
export const insertQueuedDeliveries = ResultFn(async function* (
  db: Database,
  deliveries: readonly QueuedDeliveryInput[],
) {
  if (deliveries.length === 0) return ok([])

  const inserted = await insertDeliveries(db, deliveries)
  if (inserted.isOk() || !isForeignKeyViolation(inserted.error)) return inserted

  const remainingChannels = yield* intoDbResult(
    db.query.userChannels.findMany({
      where: inArray(
        TABLE.userChannels.id,
        deliveries.map((delivery) => delivery.channelId),
      ),
      columns: { id: true },
    }),
  )
  const remainingChannelIds = new Set(
    remainingChannels.map((channel) => channel.id),
  )
  const remaining = deliveries.filter((delivery) =>
    remainingChannelIds.has(delivery.channelId),
  )
  if (remaining.length === 0) return ok([])
  return insertDeliveries(db, remaining)
})

/**
 * Why the delivery's exact source channel cannot be used now, or null. Only
 * that channel is considered: another channel sharing its target never is.
 */
const getSourceChannelUnavailableReason = (
  channelType: DeliveryChannelType,
  sourceChannel: SourceChannel | null,
  now: number,
): string | null => {
  if (!sourceChannel) return 'SOURCE_CHANNEL_REMOVED'
  if (sourceChannel.channel !== channelType)
    return 'SOURCE_CHANNEL_TYPE_MISMATCH'
  if (sourceChannel.status !== 'verified')
    return `SOURCE_CHANNEL_${sourceChannel.status.toUpperCase()}`
  if (!sourceChannel.target) return 'SOURCE_CHANNEL_MISSING_TARGET'
  if (channelType === 'push') {
    const data = sourceChannel.data as ChannelData['push'] | null
    if (!data?.auth || !data.p256dh) return 'SOURCE_CHANNEL_MISSING_KEYS'
    if (!isPushSubscriptionActive(data, now)) return 'SOURCE_CHANNEL_EXPIRED'
  }
  return null
}

/**
 * Loads a delivery and the current state of its exact source channel.
 *
 * Returns null when nothing must be sent: the delivery is already terminal, or
 * its source channel was removed or became unusable after fanout, in which
 * case the delivery is cancelled without contacting the provider.
 */
export const resolveDeliveryChannel = ResultFn(async function* <
  C extends DeliveryChannelType,
>(db: Database, job: BaseDeliveryJob, channelType: C) {
  const delivery = yield* intoDbResult(
    db.query.notificationDeliveries.findFirst({
      where: eq(TABLE.notificationDeliveries.id, job.id),
      columns: {
        status: true,
        channel: true,
      },
      with: {
        notification: {
          columns: {
            payload: true,
          },
        },
        sourceChannel: {
          columns: {
            id: true,
            channel: true,
            target: true,
            data: true,
            status: true,
          },
        },
      },
    }),
  )

  if (!delivery) {
    return yield* new NotificationDeliveryNotFoundError({
      message: `Delivery job not found: ${job.id}`,
    })
  }

  if (isTerminalDeliveryStatus(delivery.status)) {
    logger.debug('Skipping terminal delivery', {
      jobId: job.id,
      channel: channelType,
      kind: job.kind,
      status: delivery.status,
    })
    return ok(null)
  }

  const unavailableReason =
    delivery.channel === channelType
      ? getSourceChannelUnavailableReason(
          channelType,
          delivery.sourceChannel,
          Date.now(),
        )
      : 'SOURCE_CHANNEL_TYPE_MISMATCH'

  if (unavailableReason) {
    // Once submitted, a send cannot be recalled; this only prevents a send that
    // has not started. Only a non-terminal delivery is cancelled, so a copy of
    // the job that already completed its send keeps its outcome.
    const cancelled = yield* intoDbResult(
      db
        .update(TABLE.notificationDeliveries)
        .set({
          status: 'cancelled',
          error: unavailableReason,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(TABLE.notificationDeliveries.id, job.id),
            notInArray(TABLE.notificationDeliveries.status, [
              ...TERMINAL_DELIVERY_STATUSES,
            ]),
          ),
        )
        .returning({ id: TABLE.notificationDeliveries.id }),
    )

    logger.info(
      cancelled.length > 0
        ? 'Delivery cancelled, source channel unavailable'
        : 'Delivery already terminal, not cancelled',
      {
        jobId: job.id,
        channel: channelType,
        kind: job.kind,
        channelId: delivery.sourceChannel?.id ?? null,
        reason: unavailableReason,
      },
    )
    return ok(null)
  }

  const sourceChannel = delivery.sourceChannel as SourceChannel

  return ok({
    payload: delivery.notification.payload as AnyPersonalNotificationPayload,
    channel: {
      id: sourceChannel.id,
      target: sourceChannel.target as string,
      data: sourceChannel.data as ChannelData[C],
    } satisfies DeliverableChannel<C>,
  })
})
