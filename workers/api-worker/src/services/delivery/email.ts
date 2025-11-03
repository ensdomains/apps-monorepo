import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { eq } from 'drizzle-orm'
import { ok } from 'neverthrow'
import type { Database } from '#core/database/index.js'
import { TABLE } from '#core/database/index.js'
import { sendMailV3 } from '#services/email/utils.js'
import type { EmailDeliveryJob } from '#types/delivery.js'
import { logger } from '#utils/logger.js'
import { emailTemplates } from './templates/email.js'

class UnsupportedNotificationTypeError extends TaggedError(
  'UNSUPPORTED_NOTIFICATION_TYPE',
) {}

export const deliverEmailNotification = ResultFn(async function* (
  apiKey: string,
  fromEmail: string,
  db: Database,
  job: EmailDeliveryJob,
) {
  // Get the template function
  const template = emailTemplates[job.kind as keyof typeof emailTemplates]
  if (!template) {
    return yield* new UnsupportedNotificationTypeError({
      message: `No Email template for: ${job.kind}`,
    })
  }

  // Generate the template data
  const templateData = template(job.payload as any)

  // Send via SendGrid API
  const result = yield* sendMailV3(apiKey, {
    personalizations: [
      {
        to: [
          {
            email: job.target,
          },
        ],
        dynamic_template_data: templateData.dynamicData,
      },
    ],
    from: { email: fromEmail },
    subject: templateData.subject,
    template_id: templateData.templateId,
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

  logger.info('Email notification delivered', {
    jobId: job.id,
    kind: job.kind,
    templateId: templateData.templateId,
    to: job.target,
  })

  return ok(undefined)
})

export const handleEmailDeliveryFailure = async (
  db: Database,
  job: EmailDeliveryJob,
  errorMessage: string,
): Promise<void> => {
  await db
    .update(TABLE.notificationDeliveries)
    .set({
      status: 'failed',
      error: errorMessage,
      attempts: job.attempts + 1,
      updated_at: new Date(),
    })
    .where(eq(TABLE.notificationDeliveries.id, job.id))

  logger.error('Email notification failed', {
    jobId: job.id,
    kind: job.kind,
    attempts: job.attempts + 1,
    error: errorMessage,
  })
}
