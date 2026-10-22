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

export const handleQueue = async (
  batch: MessageBatch,
  env: CloudflareBindings,
): Promise<void> => {
  logger.debug('Queue batch received', {
    queue: batch.queue,
    messageCount: batch.messages.length,
  })

  const workerName =
    String(env.CHAIN) === 'mainnet'
      ? 'app-api-worker-mainnet'
      : 'app-api-worker'

  // Each environment consumes its own queues using the same handlers.
  switch (batch.queue) {
    case `${workerName}-telegram-delivery`:
      await handleTelegramQueue(batch as MessageBatch<TelegramDeliveryJob>, env)
      break
    case `${workerName}-email-delivery`:
      await handleEmailQueue(batch as MessageBatch<EmailDeliveryJob>, env)
      break
    case `${workerName}-push-delivery`:
      await handlePushQueue(batch as MessageBatch<PushDeliveryJob>, env)
      break
    case `${workerName}-event-ingestion`:
      await handleEventIngestionQueue(batch, env)
      break
    case `${workerName}-dlq`:
      await handleDlqQueue(batch as MessageBatch<BaseDeliveryJob>, env)
      break
    default:
      logger.error('Unknown queue', { queue: batch.queue })
  }
}
