import { getDatabase } from '#core/database/index.js'
import {
  deliverEmailNotification,
  handleEmailDeliveryFailure,
} from '#services/delivery/email.js'
import type { EmailDeliveryJob } from '#types/delivery.js'
import { logger } from '#utils/logger.js'

export const handleEmailQueue = async (
  batch: MessageBatch,
  env: CloudflareBindings,
): Promise<void> => {
  const db = getDatabase(env)

  for (const message of batch.messages) {
    const job = message.body as EmailDeliveryJob

    logger.info('Processing email delivery', {
      jobId: job.id,
      kind: job.kind,
    })

    // Attempt delivery
    const result = await deliverEmailNotification(
      env.SENDGRID_API_KEY,
      env.EMAIL_FROM_ADDRESS,
      db,
      job,
    )

    if (result.isErr()) {
      // Handle failure
      if (job.attempts < job.maxAttempts) {
        // Retry with exponential backoff
        const delaySeconds = Math.pow(2, job.attempts) * 60
        logger.info('Retrying email delivery', {
          jobId: job.id,
          attempt: job.attempts + 1,
          delaySeconds,
        })
        await message.retry({ delaySeconds })
      } else {
        // Max attempts reached
        await handleEmailDeliveryFailure(db, job, result.error.message)
        message.ack()
      }
    } else {
      // Success
      message.ack()
    }
  }
}
