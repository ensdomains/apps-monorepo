import type * as v from 'valibot'
import type { ChannelType } from './channels'
import { type NotificationDefinitions, notificationDefinitions } from './kinds'

export { notificationDefinitions }

export type NotificationKind = {
  [K in keyof NotificationDefinitions]: K
}[keyof NotificationDefinitions]

export type PersonalNotificationKind = {
  [K in keyof NotificationDefinitions]: NotificationDefinitions[K]['source'] extends 'personal'
    ? K
    : never
}[keyof NotificationDefinitions]

export type BroadcastNotificationKind = {
  [K in keyof NotificationDefinitions]: NotificationDefinitions[K]['source'] extends 'broadcast'
    ? K
    : never
}[keyof NotificationDefinitions]

type NotificationCatalogPayloads = {
  [K in keyof NotificationDefinitions]: v.InferOutput<
    NotificationDefinitions[K]['payloadSchema']
  >
}

export type NotificationPayloads = {
  [K in NotificationKind]: NotificationCatalogPayloads[K]
}

export type PersonalNotificationPayloads = {
  [K in PersonalNotificationKind]: NotificationCatalogPayloads[K]
}

export type BroadcastNotificationPayloads = {
  [K in BroadcastNotificationKind]: NotificationCatalogPayloads[K]
}

export type SupportedNotifications<C extends ChannelType> = {
  [K in PersonalNotificationKind]: C extends NotificationDefinitions[K]['delivery']['channels'][number]
    ? K
    : never
}[PersonalNotificationKind]

export const channelSupportsNotification = (
  channel: ChannelType,
  kind: PersonalNotificationKind,
): boolean => notificationDefinitions[kind].delivery.channels.includes(channel)
