import * as v from 'valibot'
import type {
  BroadcastNotificationKind,
  BroadcastPayloads,
  ChannelType,
  NotificationCatalogItem,
  NotificationCatalogKind,
  NotificationKind,
  NotificationPayloads,
} from '#config/notifications.js'
import {
  channelConfigs,
  notificationCatalog,
  notificationConfigs,
  notificationDefinitions,
} from '#config/notifications.js'
import type { Prettify } from './helpers'

// Re-export for convenience
export type {
  BroadcastNotificationKind,
  BroadcastPayloads,
  ChannelType,
  NotificationCatalogItem,
  NotificationCatalogKind,
  NotificationKind,
  NotificationPayloads,
}
export type UserNotificationKind = NotificationKind
export type UserChannel = ChannelType

// Keep the old valibot schemas for API validation
export const UserNotificationKindSchema = v.union(
  Object.keys(notificationConfigs).map((k) => v.literal(k as NotificationKind)),
)

export const UserChannelSchema = v.union(
  Object.keys(channelConfigs).map((k) => v.literal(k as ChannelType)),
)

// Metadata access
export const USER_NOTIFICATION_METADATA = Object.fromEntries(
  Object.entries(notificationConfigs).map(([k, v]) => [k, v.metadata]),
) as {
  [K in NotificationKind]: (typeof notificationConfigs)[K]['metadata']
}

// Legacy types for backward compatibility
export type UserNotifications = NotificationPayloads
export type AnyUserNotificationPayload =
  NotificationPayloads[keyof NotificationPayloads]

// ===============================
// Broadcasts (keeping for backward compatibility)
// ===============================

const BROADCAST_KINDS = Object.entries(notificationDefinitions)
  .filter(([, definition]) => definition.source === 'broadcast')
  .map(([kind]) => kind as BroadcastNotificationKind)

export type BroadcastKind = BroadcastNotificationKind

export type Broadcasts = BroadcastPayloads

export type Broadcast = {
  [K in BroadcastNotificationKind]: {
    kind: K
  } & BroadcastPayloads[K]
}[BroadcastNotificationKind]

export type AnyBroadcastPayload = Broadcasts[keyof Broadcasts]

export const BroadcastKindSchema = v.union(
  BROADCAST_KINDS.map((kind) => v.literal(kind)),
)

export const BroadcastSchema = v.variant(
  'kind',
  BROADCAST_KINDS.map((kind) =>
    v.object({
      kind: v.literal(kind),
      ...(
        notificationDefinitions[kind].payloadSchema as {
          entries: Record<
            string,
            v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>
          >
        }
      ).entries,
    }),
  ),
)

export const BROADCAST_METADATA = Object.fromEntries(
  BROADCAST_KINDS.map((kind) => [kind, notificationDefinitions[kind].metadata]),
) as {
  [K in BroadcastNotificationKind]: (typeof notificationDefinitions)[K]['metadata']
}

export const NOTIFICATION_METADATA: {
  [K in keyof typeof USER_NOTIFICATION_METADATA]: (typeof USER_NOTIFICATION_METADATA)[K] & {
    source: 'user'
  }
} & {
  [K in keyof typeof BROADCAST_METADATA]: (typeof BROADCAST_METADATA)[K] & {
    source: 'broadcast'
  }
} = Object.fromEntries([
  ...Object.entries(USER_NOTIFICATION_METADATA).map(([k, v]) => [
    k,
    { ...v, source: 'user' },
  ]),
  ...Object.entries(BROADCAST_METADATA).map(([k, v]) => [
    k,
    { ...v, source: 'broadcast' },
  ]),
])

export const NOTIFICATION_METADATAS = Object.entries(NOTIFICATION_METADATA).map(
  ([k, v]) => ({
    id: k,
    ...v,
  }),
) as {
  [K in keyof typeof NOTIFICATION_METADATA]: Prettify<
    (typeof NOTIFICATION_METADATA)[K] & {
      id: K
    }
  >
}[keyof typeof NOTIFICATION_METADATA][]

// ===============================
// User Channels
// ===============================

export const ChannelDataSchemas = v.object({
  email: v.null(),
  telegram: v.object({
    username: v.string(),
  }),
  push: v.object({
    // web push subscription keys for encryption
    auth: v.string(), // base64 encoded auth secret
    p256dh: v.string(), // base64 encoded P-256 public key
    expirationTime: v.optional(v.nullable(v.number())),
  }),
})

export type ChannelData = {
  [K in keyof typeof ChannelDataSchemas.entries]: v.InferOutput<
    (typeof ChannelDataSchemas.entries)[K]
  >
}

export type AnyChannelData = ChannelData[keyof ChannelData]

// ===============================
// Notification settings (new preferences model)
// ===============================

export const UserNotificationSettingsSchema = v.object({
  ownedNameExpiry: v.boolean(),
  favouritedNameExpiry: v.boolean(),
  ensLabsUpdates: v.boolean(),
})

export type UserNotificationSettings = v.InferOutput<
  typeof UserNotificationSettingsSchema
>

export const NOTIFICATION_CATALOG = notificationCatalog
