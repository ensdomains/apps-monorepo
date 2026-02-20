import * as v from 'valibot'
import { type ChannelType, channelConfigs } from './channels'
import { type NotificationDefinitions, notificationDefinitions } from './kinds'

export { notificationDefinitions }

export type NotificationKind = {
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

export type BroadcastPayloads = {
  [K in BroadcastNotificationKind]: NotificationCatalogPayloads[K]
}

const personalNotificationKinds = Object.entries(notificationDefinitions)
  .filter(([, definition]) => definition.source === 'personal')
  .map(([kind]) => kind as NotificationKind)

export const notificationConfigs = Object.fromEntries(
  personalNotificationKinds.map((kind) => [
    kind,
    {
      schema: notificationDefinitions[kind].payloadSchema,
      metadata: notificationDefinitions[kind].metadata,
      channels: notificationDefinitions[kind].delivery.channels,
    },
  ]),
) as {
  [K in NotificationKind]: {
    schema: NotificationDefinitions[K]['payloadSchema']
    metadata: NotificationDefinitions[K]['metadata']
    channels: NotificationDefinitions[K]['delivery']['channels']
  }
}

export type SupportedChannels<K extends NotificationKind> =
  NotificationDefinitions[K]['delivery']['channels'][number]

export type SupportedNotifications<C extends ChannelType> = {
  [K in NotificationKind]: C extends NotificationDefinitions[K]['delivery']['channels'][number]
    ? K
    : never
}[NotificationKind]

export const channelSupportsNotification = (
  channel: ChannelType,
  kind: NotificationKind,
): boolean =>
  notificationDefinitions[kind].delivery.channels.includes(
    channel as ChannelType,
  )

export const UserChannelSchema = v.union(
  Object.keys(channelConfigs).map((k) => v.literal(k as ChannelType)),
)
