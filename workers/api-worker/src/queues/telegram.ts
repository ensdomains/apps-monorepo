import { getDatabase } from '#core/database/index.js'
import {
  deliverTelegramNotification,
  handleTelegramDeliveryFailure,
} from '#services/delivery/telegram.js'
import type { TelegramDeliveryJob } from '#types/delivery.js'
import { logger } from '#utils/logger.js'

export const handleTelegramQueue = async (
  batch: MessageBatch,
  env: CloudflareBindings,
): Promise<void> => {
  const db = getDatabase(env)

  for (const message of batch.messages) {
    const job = message.body as TelegramDeliveryJob

    logger.info('Processing telegram delivery', {
      jobId: job.id,
      kind: job.kind,
    })

    // Attempt delivery
    const result = await deliverTelegramNotification(
      env.TELEGRAM_BOT_TOKEN,
      db,
      job,
    )

    if (result.isErr()) {
      // Handle failure
      if (job.attempts < job.maxAttempts) {
        // Retry with exponential backoff
        const delaySeconds = Math.pow(2, job.attempts) * 60
        logger.info('Retrying telegram delivery', {
          jobId: job.id,
          attempt: job.attempts + 1,
          delaySeconds,
        })
        await message.retry({ delaySeconds })
      } else {
        // Max attempts reached
        await handleTelegramDeliveryFailure(db, job, result.error.message)
        message.ack()
      }
    } else {
      // Success
      message.ack()
    }
  }
}
