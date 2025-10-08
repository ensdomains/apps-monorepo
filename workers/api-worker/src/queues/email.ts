import type { EmailDeliveryJob } from '#types/delivery.js'

export const handleEmailQueue = async (
  batch: MessageBatch,
  env: CloudflareBindings,
): Promise<void> => {
  // TODO: Implement email delivery
  // Email can batch multiple notifications together
  for (const message of batch.messages) {
    const job = message.body as EmailDeliveryJob
    // Future implementation
    message.ack()
  }
}
