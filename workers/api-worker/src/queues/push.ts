import { getDatabase } from '#core/database/index.js'
import {
  deliverPushNotification,
  handlePushDeliveryFailure,
} from '#services/delivery/push.js'
import type { PushDeliveryJob } from '#types/delivery.js'
import { logger } from '#utils/logger.js'

export const handlePushQueue = async (
  batch: MessageBatch<PushDeliveryJob>,
  env: CloudflareBindings,
): Promise<void> => {
  const db = getDatabase(env)

  for (const message of batch.messages) {
    const job = message.body

    logger.info('Processing push delivery', {
      jobId: job.id,
      kind: job.kind,
    })

    // attempt delivery
    const result = await deliverPushNotification(
      {
        VAPID_SUBJECT: env.VAPID_SUBJECT,
        VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
      },
      db,
      job,
    )

    if (result.isErr()) {
      await handlePushDeliveryFailure(db, message, result.error.message)
      message.retry()
    } else {
      // success
      message.ack()
    }
  }
}
