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
import { encodeNamePathSegment, normalizeNotificationName } from './sanitize.js'

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
  match(context.notice)
    .with({ kind: 'pre-expiry' }, () => ({
      title: 'ENS name expiring soon',
      body: `${context.name} expires in ${formatDayCount(context.daysUntilExpiry)}`,
      url: context.renewPath,
    }))
    .with({ kind: 'grace-start' }, () => ({
      title: 'ENS name in grace period',
      body: `${context.name} expired but can still be renewed`,
      url: context.renewPath,
    }))
    .with({ kind: 'grace-ending' }, () => ({
      title: 'ENS grace period ending soon',
      body: `${context.name} grace period ends in ${formatDayCount(context.daysUntilGraceEnd)}`,
      url: context.renewPath,
    }))
    .with({ kind: 'premium-start' }, () => ({
      title: 'ENS grace period ended',
      body: `${context.name} has entered the temporary premium period`,
      url: context.registerPath,
    }))
    .with({ kind: 'subname-pre-expiry' }, ({ parentName }) => ({
      title: 'ENS name expiring soon',
      body: `${context.name} expires in ${formatDayCount(context.daysUntilExpiry)}. The owner of ${parentName} can extend it`,
      url: context.profilePath,
    }))
    .with({ kind: 'subname-expired' }, ({ parentName }) => ({
      title: 'ENS name expired',
      body: `${context.name} has expired. The owner of ${parentName} can extend it`,
      url: context.profilePath,
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

  'name-transferred': (payload) => {
    const name = normalizeNotificationName(payload.name)
    return {
      title: 'ENS Name Transferred',
      body: `${name} was transferred to ${payload.to.slice(0, 6)}...${payload.to.slice(-4)}`,
      tag: `transfer-${name}`,
      data: {
        url: `/${encodeNamePathSegment(name)}`,
        name,
        txHash: payload.txHash,
      },
    }
  },
}
