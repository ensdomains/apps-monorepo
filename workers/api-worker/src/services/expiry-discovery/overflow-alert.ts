import { makeTelegramRequest } from '#services/telegram/utils.js'
import type { ExpiryStageId } from '#types/events/index.js'
import { logger } from '#utils/logger.js'
import { PROCESS_PAGE_SIZE } from './indexer.js'

export type ExpiryOverflowAlertContext = {
  env: CloudflareBindings
  stageId: ExpiryStageId
  expiryTimestamp: number
  processedCount: number
}

function toIsoTimestamp(expiryTimestamp: number): string {
  try {
    return new Date(expiryTimestamp * 1000).toISOString()
  } catch {
    return 'invalid'
  }
}

function buildOverflowLogFields(ctx: Omit<ExpiryOverflowAlertContext, 'env'>) {
  return {
    stage: ctx.stageId,
    expiryTimestamp: ctx.expiryTimestamp,
    expiryTimestampIso: toIsoTimestamp(ctx.expiryTimestamp),
    processedCount: ctx.processedCount,
    maxPerTimestamp: PROCESS_PAGE_SIZE,
    detail:
      'Additional names at this expiry timestamp were skipped so discovery can continue.',
  }
}

function buildOverflowAlertText(
  fields: ReturnType<typeof buildOverflowLogFields>,
): string {
  return [
    'Expiry discovery overflow: more than 1000 names share one expiry timestamp.',
    `stage: ${fields.stage}`,
    `expiryTimestamp: ${fields.expiryTimestamp} (${fields.expiryTimestampIso})`,
    `processedCount: ${fields.processedCount}`,
    `maxPerTimestamp: ${fields.maxPerTimestamp}`,
    fields.detail,
  ].join('\n')
}

async function sendOverflowTelegramAlert(
  ctx: ExpiryOverflowAlertContext,
  fields: ReturnType<typeof buildOverflowLogFields>,
): Promise<void> {
  const chatId = ctx.env.TELEGRAM.ALERT_CHAT_ID?.trim()
  if (!chatId) return

  const token = ctx.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    logger.error('Expiry overflow Telegram alert failed', {
      ...fields,
      error: 'TELEGRAM_BOT_TOKEN is not configured',
    })
    return
  }

  const result = await makeTelegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text: buildOverflowAlertText(fields),
  })

  if (result.isErr()) {
    logger.error('Expiry overflow Telegram alert failed', {
      ...fields,
      error: result.error,
    })
  }
}

/**
 * Best-effort operational alert for the pathological same-second overflow.
 * Structured logging always runs. Telegram is attempted when configured.
 * Failures must never throw or fail expiry discovery.
 */
export async function reportExpiryTimestampOverflow(
  ctx: ExpiryOverflowAlertContext,
): Promise<void> {
  try {
    const fields = buildOverflowLogFields(ctx)
    logger.error(
      'Expiry discovery skipped names sharing one expiry timestamp',
      fields,
    )
    await sendOverflowTelegramAlert(ctx, fields)
  } catch (error) {
    try {
      logger.error('Expiry overflow Telegram alert failed', { error })
    } catch {
      // Logging must not fail the stage.
    }
  }
}
