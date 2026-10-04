import { ResultFn } from '@ens-apps/utils/neverthrow'
import { eq } from 'drizzle-orm'
import { fromPromise, ok } from 'neverthrow'
import type { Database } from '#core/database/index.js'
import { TABLE } from '#core/database/index.js'
import { sendRenderedEmail } from '#services/email/send.js'
import type { EmailDeliveryJob } from '#types/delivery.js'
import { logger } from '#utils/logger.js'
import { createIntoError } from '#utils/result.js'
import { resolveDeliveryChannel } from './channel.js'
import { UnsupportedNotificationTypeError } from './errors.js'
import { type EmailTemplate, emailTemplates } from './templates/email.js'

export const deliverEmailNotification = ResultFn(async function* (
  apiKey: string,
  fromEmail: string,
  db: Database,
  job: EmailDeliveryJob,
) {
  const delivery = yield* resolveDeliveryChannel(db, job, 'email')
  if (!delivery) return ok(undefined)

  // Get the template function
  const template = emailTemplates[job.kind] as EmailTemplate<typeof job.kind>
  if (!template) {
    return yield* new UnsupportedNotificationTypeError({
      message: `No Email template for: ${job.kind}`,
    })
  }

  // Render locally; SendGrid only receives the finished email
  const email = yield* fromPromise(
    template(delivery.payload),
    createIntoError('EMAIL_RENDER_ERROR'),
  )

  const result = yield* sendRenderedEmail(apiKey, {
    from: fromEmail,
    to: delivery.channel.target,
    email,
  })

  // Update delivery record
  // SendGrid doesn't return a message_id in the response, but we can use the timestamp or a generated ID
  // For now, we'll use the status code and timestamp as a unique identifier
  const providerMsgId = `${result.statusCode}-${Date.now()}`

  await db
    .update(TABLE.notificationDeliveries)
    .set({
      status: 'delivered',
      provider_msg_id: providerMsgId,
      updated_at: new Date(),
    })
    .where(eq(TABLE.notificationDeliveries.id, job.id))

  logger.debug('Email notification delivered', {
    jobId: job.id,
    kind: job.kind,
    channelId: delivery.channel.id,
  })

  return ok(undefined)
})

export const handleEmailDeliveryFailure = async (
  db: Database,
  message: Message<EmailDeliveryJob>,
  errorMessage: string,
): Promise<void> => {
  await db
    .update(TABLE.notificationDeliveries)
    .set({
      status: 'failed',
      error: errorMessage,
      attempts: message.attempts + 1,
      updated_at: new Date(),
    })
    .where(eq(TABLE.notificationDeliveries.id, message.body.id))

  logger.error('Email notification failed', {
    jobId: message.body.id,
    kind: message.body.kind,
    attempts: message.attempts + 1,
    error: errorMessage,
  })
}
