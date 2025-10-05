import type { KindToPayload, Prettify } from './helpers'
import * as v from 'valibot'

type BaseMetadata = {
  /**
   * Whether the notification is recommended/enabled by default
   */
  recommended: boolean

  category: string
  label: string
  description: string
}

const builder = <const TKind extends string, const TEntries extends v.ObjectEntries, const TMeta extends BaseMetadata>(kind: TKind, entries: TEntries, meta: TMeta) => v.pipe(v.object({
  kind: v.literal(kind),
  ...entries,
}), v.metadata(meta))

// ===============================
// Notifications
// ===============================

const USER_NOTIFICATIONS = [
  builder('name-expiry', {
    name: v.string(),
    expiryDate: v.number(),
  }, {
    recommended: true,
    category: 'Domain Lifecycle',
    label: 'Name Expiry',
    description: 'Get notified when your domains are about to expire',
    thresholds: [30, 7, 1],
  }),
  builder('name-transferred', {
    name: v.string(),
    txHash: v.string(),
    to: v.string(),
  }, {
    recommended: true,
    category: 'Domain Lifecycle',
    label: 'Name Transferred',
    description: 'Get notified when your domains are transferred',
  }),
]

const BROADCASTS = [
  builder('blog-post', {
    title: v.string(),
    url: v.string(),
    imageUrl: v.string(),
  }, {
    recommended: false,
    category: 'Marketing',
    label: 'Blog Post',
    description: 'Get notified when a new blog post is published',
  }),
]

export const UserNotificationSchema = v.variant('kind', USER_NOTIFICATIONS)

export type UserNotification = v.InferOutput<typeof UserNotificationSchema>

type UserNotificationMetadata = {
  [S in typeof USER_NOTIFICATIONS[number] as S['entries']['kind']['literal']]: v.InferMetadata<S>
}
export const USER_NOTIFICATION_METADATA: UserNotificationMetadata = Object.fromEntries(USER_NOTIFICATIONS.map(n => [n.entries.kind.literal, v.getMetadata(n)])) as UserNotificationMetadata

export type UserNotifications = KindToPayload<UserNotification>
export type AnyUserNotificationPayload = UserNotifications[keyof UserNotifications]

export const UserNotificationKindSchema = v.union(UserNotificationSchema.options.map(o => o.entries.kind))
export type UserNotificationKind = v.InferOutput<typeof UserNotificationKindSchema>

// ===============================
// Broadcasts
// ===============================


export const BroadcastSchema = v.variant('kind', BROADCASTS)
export type Broadcast = v.InferOutput<typeof BroadcastSchema>

export const BROADCAST_METADATA: {
  [S in typeof BROADCASTS[number] as S['entries']['kind']['literal']]: v.InferMetadata<S>
} = Object.fromEntries(BROADCASTS.map(n => [n.entries.kind, v.getMetadata(n)]))

export type Broadcasts = KindToPayload<Broadcast>

export type AnyBroadcastPayload = Broadcasts[keyof Broadcasts]

export const BroadcastKindSchema = v.union(BroadcastSchema.options.map(o => o.entries.kind))
export type BroadcastKind = v.InferOutput<typeof BroadcastKindSchema>


// export const Notification

export const NOTIFICATION_METADATA: {
  [K in keyof typeof USER_NOTIFICATION_METADATA]: typeof USER_NOTIFICATION_METADATA[K] & {
    source: 'user'
  }
} & {
  [K in keyof typeof BROADCAST_METADATA]: typeof BROADCAST_METADATA[K] & {
    source: 'broadcast'
  }
} = Object.fromEntries([
  ...Object.entries(USER_NOTIFICATION_METADATA).map(([k, v]) => [k, { ...v, source: 'user' }]),
  ...Object.entries(BROADCAST_METADATA).map(([k, v]) => [k, { ...v, source: 'broadcast' }]),
])


export const NOTIFICATION_METADATAS = Object.entries(NOTIFICATION_METADATA).map(([k, v]) => ({
  id: k,
  ...v,
})) as {
  [K in keyof typeof NOTIFICATION_METADATA]: Prettify<typeof NOTIFICATION_METADATA[K] & {
    id: K
  }>
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
    token: v.string(),
  }),
})


export type ChannelData = {
  [K in keyof typeof ChannelDataSchemas.entries]: v.InferOutput<typeof ChannelDataSchemas.entries[K]>
}

export const UserChannelSchema = v.keyof(ChannelDataSchemas)

export type UserChannel = v.InferOutput<typeof UserChannelSchema>

export type AnyChannelData = ChannelData[keyof ChannelData]
