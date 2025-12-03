import * as v from 'valibot'

// Define notification configurations with schemas and metadata
const notificationConfigs = {
  'name-expiry': {
    schema: v.object({
      name: v.string(),
      expiryDate: v.number(),
      isOwner: v.boolean(),
    }),
    metadata: {
      category: 'Domain Lifecycle',
      label: 'Name Expiry',
      description: 'Get notified when your domains are about to expire',
      recommended: true,
      thresholds: [30, 7, 1],
    },
    // Define which channels support this notification
    channels: ['email', 'telegram', 'push'] as const,
  },
  'name-transferred': {
    schema: v.object({
      name: v.string(),
      txHash: v.string(),
      to: v.string(),
    }),
    metadata: {
      category: 'Domain Lifecycle',
      label: 'Name Transferred',
      description: 'Get notified when your domains are transferred',
      recommended: true,
    },
    channels: ['email', 'telegram', 'push'] as const,
  },
} as const satisfies Record<string, NotificationConfig>

// Channel configurations
const channelConfigs = {
  email: {
    label: 'Email',
    requiresVerification: true,
    supportsRichContent: true,
    batchable: true, // Can batch multiple notifications into one email
  },
  telegram: {
    label: 'Telegram',
    requiresVerification: true,
    supportsRichContent: true,
    batchable: false, // Send individual messages
  },
  push: {
    label: 'Push Notification',
    requiresVerification: true,
    supportsRichContent: false,
    batchable: false,
  },
} as const satisfies Record<string, ChannelConfig>

// Export the configs
export { notificationConfigs, channelConfigs }

// Derive types from the configuration
export type NotificationKind = keyof typeof notificationConfigs
export type NotificationPayloads = {
  [K in NotificationKind]: v.InferOutput<
    (typeof notificationConfigs)[K]['schema']
  >
}
export type ChannelType = keyof typeof channelConfigs

// Type to get supported channels for a notification kind
export type SupportedChannels<K extends NotificationKind> =
  (typeof notificationConfigs)[K]['channels'][number]

// Type to get supported notifications for a channel
export type SupportedNotifications<C extends ChannelType> = {
  [K in NotificationKind]: C extends (typeof notificationConfigs)[K]['channels'][number]
    ? K
    : never
}[NotificationKind]

// Utility to check if a channel supports a notification at runtime
export function channelSupportsNotification(
  channel: ChannelType,
  kind: NotificationKind,
): boolean {
  return notificationConfigs[kind].channels.includes(channel as ChannelType)
}

// Type definitions for the config objects
type NotificationConfig = {
  schema: v.BaseSchema<any, any, any>
  metadata: {
    category: string
    label: string
    description: string
    recommended: boolean
  } & Record<string & {}, any>
  channels: readonly ChannelType[]
}

type ChannelConfig = {
  label: string
  requiresVerification: boolean
  supportsRichContent: boolean
  batchable: boolean
}
