import type { EmailDeliveryJob, TelegramDeliveryJob } from '#types/delivery.js'
import { handleEmailQueue } from './email.js'
import { handleTelegramQueue } from './telegram.js'

export const handleQueue = async (
  batch: MessageBatch,
  env: CloudflareBindings,
): Promise<void> => {
  // Route to appropriate queue handler based on queue name
  switch (batch.queue) {
    case 'api-worker-telegram-delivery':
      await handleTelegramQueue(batch as MessageBatch<TelegramDeliveryJob>, env)
      break
    case 'api-worker-email-delivery':
      await handleEmailQueue(batch as MessageBatch<EmailDeliveryJob>, env)
      break
    default:
      console.error(`Unknown queue: ${batch.queue}`)
  }
}
