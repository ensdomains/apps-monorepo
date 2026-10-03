import { env } from 'cloudflare:workers'
import type {
  PersonalNotificationPayloads,
  SupportedNotifications,
} from '@ens-apps/shared-schema/notifications'
import { match } from 'ts-pattern'
import {
  buildNameExpiryDeliveryContext,
  formatCalendarDate,
  formatDayCount,
  type NameExpiryDeliveryContext,
  type NameExpiryRenderOptions,
} from './name-expiry.js'
import { escapeHtml, normalizeNotificationName } from './sanitize.js'

type TelegramMessage = {
  text: string
  parseMode?: 'Markdown' | 'HTML'
  buttons?: Array<
    Array<{
      text: string
      url?: string
      callbackData?: string
    }>
  >
}

// Template function type
export type TelegramTemplate<K extends SupportedNotifications<'telegram'>> = (
  payload: PersonalNotificationPayloads[K],
) => TelegramMessage

const telegramCode = (value: string): string =>
  `<code>${escapeHtml(normalizeNotificationName(value))}</code>`
const telegramBold = (value: string): string => `<b>${escapeHtml(value)}</b>`

const nameExpiryTelegramCopy = (context: NameExpiryDeliveryContext) =>
  match(context.noticeKind)
    .with('pre-expiry', () => ({
      title: 'Domain expiration alert',
      body: `${telegramCode(context.name)} expires in ${telegramBold(formatDayCount(context.daysUntilExpiry))}.`,
      buttonText: 'Renew Now',
      url: context.renewUrl,
    }))
    .with('grace-start', () => ({
      title: 'Grace period started',
      body: `${telegramCode(context.name)} has expired but can still be renewed until ${telegramBold(formatCalendarDate(context.graceEndDate))}.`,
      buttonText: 'Renew Now',
      url: context.renewUrl,
    }))
    .with('grace-ending', () => ({
      title: 'Grace period ending soon',
      body: `${telegramCode(context.name)} grace period ends in ${telegramBold(formatDayCount(context.daysUntilGraceEnd))}. Renew now to keep the name.`,
      buttonText: 'Renew Now',
      url: context.renewUrl,
    }))
    .with('premium-start', () => ({
      title: 'Grace period ended',
      body: `${telegramCode(context.name)} is no longer in its grace period and has entered the temporary premium period.`,
      buttonText: 'Register Name',
      url: context.registerUrl,
    }))
    .exhaustive()

export const buildNameExpiryTelegramMessage = (
  payload: PersonalNotificationPayloads['name-expiry'],
  options: NameExpiryRenderOptions,
): TelegramMessage => {
  const copy = nameExpiryTelegramCopy(
    buildNameExpiryDeliveryContext(payload, options),
  )
  return {
    text: `⚠️ ${telegramBold(copy.title)}\n\n${copy.body}`,
    parseMode: 'HTML',
    buttons: [[{ text: copy.buttonText, url: copy.url }]],
  }
}

// Define all telegram templates
// TypeScript will error if we miss a notification that telegram supports
export const telegramTemplates: {
  [K in SupportedNotifications<'telegram'>]: TelegramTemplate<K>
} = {
  'name-expiry': (payload) =>
    buildNameExpiryTelegramMessage(payload, {
      managerAppUrl: env.MANAGER_APP_URL,
    }),

  'name-transferred': (payload) => {
    return {
      text:
        `🔄 ${telegramBold('Domain Transfer')}\n\n` +
        `Your domain ${telegramCode(payload.name)} has been transferred.\n\n` +
        `To: ${telegramCode(payload.to)}\n` +
        `Transaction: ${telegramCode(payload.txHash)}`,
      parseMode: 'HTML',
      buttons: [
        [
          {
            text: '🔍 View Transaction',
            url: `https://etherscan.io/tx/${encodeURIComponent(payload.txHash)}`,
          },
        ],
      ],
    }
  },
}
