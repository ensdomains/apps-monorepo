import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { eq } from 'drizzle-orm'
import { err, ok } from 'neverthrow'
import type { Database } from '#core/database/index.js'
import { TABLE } from '#core/database/index.js'
import {
  createInlineKeyboard,
  makeTelegramRequest,
} from '#services/telegram/utils.js'
import type { TelegramDeliveryJob } from '#types/delivery.js'
import { logger } from '#utils/logger.js'
import { telegramTemplates } from './templates/telegram.js'

class UnsupportedNotificationTypeError extends TaggedError(
  'UNSUPPORTED_NOTIFICATION_TYPE',
) {}

export const deliverTelegramNotification = ResultFn(async function* (
  botToken: string,
  db: Database,
  job: TelegramDeliveryJob,
) {
  // Get the template function
  const template = telegramTemplates[job.kind as keyof typeof telegramTemplates]
  if (!template) {
    return yield* new UnsupportedNotificationTypeError({
      message: `No Telegram template for: ${job.kind}`,
    })
  }

  // Generate the message
  const message = template(job.payload as any)

  // Create keyboard if buttons exist
  const replyMarkup = message.buttons
    ? createInlineKeyboard(message.buttons)
    : undefined

  // Send via Telegram API
  const result = yield* makeTelegramRequest(botToken, 'sendMessage', {
    chat_id: job.target,
    text: message.text,
    parse_mode: message.parseMode,
    reply_markup: replyMarkup,
  })

  // Update delivery record
  await db
    .update(TABLE.notificationDeliveries)
    .set({
      status: 'delivered',
      provider_msg_id: result.message_id.toString(),
      updated_at: new Date(),
    })
    .where(eq(TABLE.notificationDeliveries.id, job.id))

  logger.info('Telegram notification delivered', {
    jobId: job.id,
    kind: job.kind,
    messageId: result.message_id,
  })

  return ok(undefined)
})

export const handleTelegramDeliveryFailure = async (
  db: Database,
  job: TelegramDeliveryJob,
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

  logger.error('Telegram notification failed', {
    jobId: job.id,
    kind: job.kind,
    attempts: job.attempts + 1,
    error: errorMessage,
  })
}
