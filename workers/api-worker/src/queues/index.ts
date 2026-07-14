import type {
  BaseDeliveryJob,
  EmailDeliveryJob,
  PushDeliveryJob,
  TelegramDeliveryJob,
} from '#types/delivery.js'
import { logger } from '#utils/logger.js'
import { handleDlqQueue } from './dlq.js'
import { handleEmailQueue } from './email.js'
import { handleEventIngestionQueue } from './event-ingestion.js'
import { handlePushQueue } from './push.js'
import { handleTelegramQueue } from './telegram.js'

/**
 * The queue's logical suffix, with the worker-name prefix stripped so a
 * per-branch/preview deploy's queue (`app-api-worker-pr-123-telegram-delivery`)
 * routes to the same handler as production (`app-api-worker-telegram-delivery`).
 * Names that don't carry the prefix are returned unchanged.
 */
export const queueSuffix = (queueName: string): string =>
  queueName.replace(/^app-api-worker(-pr-\d+)?-/, '')

export const handleQueue = async (
  batch: MessageBatch,
  env: CloudflareBindings,
): Promise<void> => {
  logger.debug('Queue batch received', {
    queue: batch.queue,
    messageCount: batch.messages.length,
  })

  // Route by the logical suffix rather than the full queue name, so per-branch
  // deploys route identically to production.
  switch (queueSuffix(batch.queue)) {
    case 'telegram-delivery':
      await handleTelegramQueue(batch as MessageBatch<TelegramDeliveryJob>, env)
      break
    case 'email-delivery':
      await handleEmailQueue(batch as MessageBatch<EmailDeliveryJob>, env)
      break
    case 'push-delivery':
      await handlePushQueue(batch as MessageBatch<PushDeliveryJob>, env)
      break
    case 'event-ingestion':
      await handleEventIngestionQueue(batch, env)
      break
    case 'dlq':
      await handleDlqQueue(batch as MessageBatch<BaseDeliveryJob>, env)
      break
    default:
      // Throw rather than silently ack-and-drop the batch: an unrecognised
      // queue is a misconfiguration, and returning here would lose the
      // messages. Throwing lets the batch retry and surfaces the error.
      throw new Error(`Unhandled queue: ${batch.queue}`)
  }
}
