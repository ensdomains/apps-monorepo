import { makeTelegramRequest } from '#services/telegram/utils.js'
import type { ExpiryStageId } from '#types/events/index.js'
import { logger } from '#utils/logger.js'
import { MAX_NAMES_PER_SOURCE } from './page.js'

export type ExpiryOverflowAlertContext = {
  env: CloudflareBindings
  stageId: ExpiryStageId
  expiryTimestamp: number
  processedCount: number
}

const toIsoTimestamp = (timestamp: number): string => {
  try {
    return new Date(timestamp * 1000).toISOString()
  } catch {
    return 'invalid'
  }
}

const buildOverflowFields = (ctx: Omit<ExpiryOverflowAlertContext, 'env'>) => ({
  stage: ctx.stageId,
  expiryTimestamp: ctx.expiryTimestamp,
  expiryTimestampIso: toIsoTimestamp(ctx.expiryTimestamp),
  processedCount: ctx.processedCount,
  maxPerTimestamp: MAX_NAMES_PER_SOURCE,
  detail:
    'Names sharing one expiry second filled the page budget; additional names may have been skipped so discovery can continue.',
})

export async function reportExpiryTimestampOverflow(
  ctx: ExpiryOverflowAlertContext,
): Promise<void> {
  const fields = buildOverflowFields(ctx)
  logger.error('Expiry discovery exact-timestamp bucket saturated', fields)

  const chatId = ctx.env.TELEGRAM?.ALERT_CHAT_ID?.trim()
  if (!chatId) return
  if (!ctx.env.TELEGRAM_BOT_TOKEN) {
    logger.error('Expiry overflow Telegram alert failed', {
      ...fields,
      error: 'TELEGRAM_BOT_TOKEN is not configured',
    })
    return
  }

  try {
    const result = await makeTelegramRequest(
      ctx.env.TELEGRAM_BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text: [
          `Expiry discovery overflow: one expiry second reached the ${fields.maxPerTimestamp}-name page budget.`,
          `stage: ${fields.stage}`,
          `expiryTimestamp: ${fields.expiryTimestamp} (${fields.expiryTimestampIso})`,
          `processedCount: ${fields.processedCount}`,
          `maxPerTimestamp: ${fields.maxPerTimestamp}`,
          fields.detail,
        ].join('\n'),
      },
    )
    if (result.isErr()) {
      logger.error('Expiry overflow Telegram alert failed', {
        ...fields,
        error: result.error,
      })
    }
  } catch (error) {
    logger.error('Expiry overflow Telegram alert failed', { ...fields, error })
  }
}
