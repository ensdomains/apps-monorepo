import * as v from 'valibot'
import type {
  BroadcastNotificationKind,
  BroadcastPayloads,
  NotificationPayloads,
} from './catalog'

export type UserNotifications = NotificationPayloads
export type AnyUserNotificationPayload =
  NotificationPayloads[keyof NotificationPayloads]

export type BroadcastKind = BroadcastNotificationKind
export type Broadcasts = BroadcastPayloads

export type Broadcast = {
  [K in BroadcastNotificationKind]: {
    kind: K
  } & BroadcastPayloads[K]
}[BroadcastNotificationKind]

export type AnyBroadcastPayload = Broadcasts[keyof Broadcasts]

export const ChannelDataSchemas = v.object({
  email: v.null(),
  telegram: v.object({
    username: v.string(),
  }),
  push: v.object({
    auth: v.string(),
    p256dh: v.string(),
    expirationTime: v.optional(v.nullable(v.number())),
  }),
})

export type ChannelData = {
  [K in keyof typeof ChannelDataSchemas.entries]: v.InferOutput<
    (typeof ChannelDataSchemas.entries)[K]
  >
}

export type AnyChannelData = ChannelData[keyof ChannelData & string]

export const UserNotificationSettingsSchema = v.object({
  ownedNameExpiry: v.boolean(),
  favouritedNameExpiry: v.boolean(),
  ensLabsUpdates: v.boolean(),
})

export type UserNotificationSettings = v.InferOutput<
  typeof UserNotificationSettingsSchema
>
