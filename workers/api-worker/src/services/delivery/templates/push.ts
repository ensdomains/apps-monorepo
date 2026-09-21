import { env } from 'cloudflare:workers'
import type {
  PersonalNotificationPayloads,
  SupportedNotifications,
} from '@ens-apps/shared-schema/notifications'
import { match } from 'ts-pattern'
import {
  buildNameExpiryDeliveryContext,
  formatDayCount,
  type NameExpiryDeliveryContext,
  type NameExpiryRenderOptions,
} from './name-expiry.js'

export type PushNotificationData = {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  data?: Record<string, string | number | boolean | null>
}

export type PushTemplate<K extends SupportedNotifications<'push'>> = (
  payload: PersonalNotificationPayloads[K],
) => PushNotificationData

const nameExpiryPushCopy = (context: NameExpiryDeliveryContext) =>
  match(context.noticeKind)
    .with('pre-expiry', () => ({
      title: 'ENS name expiring soon',
      body: `${context.name} expires in ${formatDayCount(context.daysUntilExpiry)}`,
      url: context.renewUrl,
    }))
    .with('grace-start', () => ({
      title: 'ENS name in grace period',
      body: `${context.name} expired but can still be renewed`,
      url: context.renewUrl,
    }))
    .with('grace-ending', () => ({
      title: 'ENS grace period ending soon',
      body: `${context.name} grace period ends in ${formatDayCount(context.daysUntilGraceEnd)}`,
      url: context.renewUrl,
    }))
    .with('premium-start', () => ({
      title: 'ENS grace period ended',
      body: `${context.name} has entered the temporary premium period`,
      url: context.registerUrl,
    }))
    .exhaustive()

export const buildNameExpiryPushNotification = (
  payload: PersonalNotificationPayloads['name-expiry'],
  options: NameExpiryRenderOptions,
): PushNotificationData => {
  const context = buildNameExpiryDeliveryContext(payload, options)
  const copy = nameExpiryPushCopy(context)

  return {
    title: copy.title,
    body: copy.body,
    tag: `expiry-${context.name}`,
    data: {
      url: copy.url,
      name: context.name,
      expiryDate: payload.expiryDate,
      protocol: context.protocol,
      stage: context.stage ?? null,
    },
  }
}

export const pushTemplates: {
  [K in SupportedNotifications<'push'>]: PushTemplate<K>
} = {
  'name-expiry': (payload) =>
    buildNameExpiryPushNotification(payload, {
      managerAppUrl: env.MANAGER_APP_URL,
    }),
  'name-transferred': (payload) => ({
    title: 'ENS Name Transferred',
    body: `${payload.name} was transferred to ${payload.to.slice(0, 6)}...${payload.to.slice(-4)}`,
    tag: `transfer-${payload.name}`,
    data: {
      url: `/${payload.name}`,
      name: payload.name,
      txHash: payload.txHash,
    },
  }),
}
