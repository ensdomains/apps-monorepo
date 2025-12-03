import { getDatabase } from '#core/database/index.js'
import {
  deliverEmailNotification,
  handleEmailDeliveryFailure,
} from '#services/delivery/email.js'
import type { EmailDeliveryJob } from '#types/delivery.js'
import { logger } from '#utils/logger.js'

export const handleEmailQueue = async (
  batch: MessageBatch<EmailDeliveryJob>,
  env: CloudflareBindings,
): Promise<void> => {
  const db = getDatabase(env)

  for (const message of batch.messages) {
    const job = message.body

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
      await handleEmailDeliveryFailure(db, message, result.error.message)
      message.retry()
    } else {
      // Success
      message.ack()
    }
  }
}
