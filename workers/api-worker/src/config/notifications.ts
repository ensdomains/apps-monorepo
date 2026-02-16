import * as v from 'valibot'

type NotificationSource = 'personal' | 'broadcast'
type NotificationTemplate = 'name-card' | 'content-card' | 'message-card'
type NotificationAction =
  | {
      kind: 'internal-link'
      label: string
    }
  | {
      kind: 'external-link'
      label: string
    }
type NotificationPriority = 'low' | 'medium' | 'high'
type DeliveryMode = 'none' | 'opt-in'
type DeliveryPreferenceKey =
  | 'ownedNameExpiry'
  | 'favouritedNameExpiry'
  | 'ensLabsUpdates'
  | 'watchBasedNameExpiry'

type PayloadSchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>

type NotificationMetadata = {
  category: string
  label: string
  description: string
  priority: NotificationPriority
  recommended: boolean
  tags?: readonly string[]
  thresholds?: readonly number[]
}

type NotificationUI = {
  template: NotificationTemplate
  supportsGrouping: boolean
  action?: NotificationAction
}

type NotificationDelivery = {
  mode: DeliveryMode
  channels: readonly ChannelType[]
  preferenceKey?: DeliveryPreferenceKey
}

type NotificationDefinition = {
  kind: string
  source: NotificationSource
  payloadSchema: PayloadSchema
  metadata: NotificationMetadata
  ui: NotificationUI
  delivery: NotificationDelivery
}

type ChannelConfig = {
  label: string
  requiresVerification: boolean
  supportsRichContent: boolean
  batchable: boolean
}

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

export type ChannelType = keyof typeof channelConfigs

// Canonical notification definitions with schema + metadata + UI + delivery
const notificationDefinitions = {
  'name-expiry': {
    kind: 'name-expiry',
    source: 'personal',
    payloadSchema: v.object({
      name: v.string(),
      expiryDate: v.number(),
      isOwner: v.boolean(),
      watchReason: v.picklist(['owned', 'favourited', 'manual']),
    }),
    metadata: {
      category: 'Domain Lifecycle',
      label: 'Name Expiry',
      description: 'Get notified when your domains are about to expire',
      priority: 'high',
      recommended: true,
      thresholds: [30, 7, 1],
      tags: ['expiry'],
    },
    ui: {
      template: 'name-card',
      supportsGrouping: true,
      action: {
        kind: 'internal-link',
        label: 'Extend',
      },
    },
    delivery: {
      mode: 'opt-in',
      channels: ['email', 'telegram', 'push'],
      preferenceKey: 'watchBasedNameExpiry',
    },
  },
  'name-transferred': {
    kind: 'name-transferred',
    source: 'personal',
    payloadSchema: v.object({
      name: v.string(),
      txHash: v.string(),
      to: v.string(),
    }),
    metadata: {
      category: 'Domain Lifecycle',
      label: 'Name Transferred',
      description: 'Get notified when your domains are transferred',
      priority: 'medium',
      recommended: true,
      tags: ['transfer'],
    },
    ui: {
      template: 'name-card',
      supportsGrouping: false,
      action: {
        kind: 'external-link',
        label: 'View on Etherscan',
      },
    },
    delivery: {
      // Keep current behaviour: stored in dashboard/nav, no external delivery yet.
      mode: 'none',
      channels: ['email', 'telegram', 'push'],
    },
  },
  'blog-post': {
    kind: 'blog-post',
    source: 'broadcast',
    payloadSchema: v.object({
      title: v.string(),
      url: v.string(),
      imageUrl: v.string(),
    }),
    metadata: {
      category: 'ENS Updates',
      label: 'Blog Post',
      description: 'Get notified when a new blog post is published',
      priority: 'low',
      recommended: false,
      tags: ['education', 'updates'],
    },
    ui: {
      template: 'content-card',
      supportsGrouping: false,
      action: {
        kind: 'external-link',
        label: 'Go to post',
      },
    },
    delivery: {
      mode: 'none',
      channels: [],
    },
  },
  'alpha-welcome': {
    kind: 'alpha-welcome',
    source: 'broadcast',
    payloadSchema: v.object({
      title: v.string(),
      body: v.string(),
      ctaLabel: v.optional(v.string()),
      ctaUrl: v.optional(v.string()),
    }),
    metadata: {
      category: 'ENS Updates',
      label: 'Welcome',
      description: 'Welcome and onboarding notifications in alpha',
      priority: 'medium',
      recommended: false,
      tags: ['onboarding'],
    },
    ui: {
      template: 'message-card',
      supportsGrouping: false,
    },
    delivery: {
      mode: 'none',
      channels: [],
    },
  },
  'ens-update': {
    kind: 'ens-update',
    source: 'broadcast',
    payloadSchema: v.object({
      title: v.string(),
      summary: v.string(),
      url: v.optional(v.string()),
    }),
    metadata: {
      category: 'ENS Updates',
      label: 'ENS Update',
      description: 'Protocol and product updates in dashboard notifications',
      priority: 'medium',
      recommended: true,
      tags: ['updates'],
    },
    ui: {
      template: 'message-card',
      supportsGrouping: false,
      action: {
        kind: 'external-link',
        label: 'Read more',
      },
    },
    delivery: {
      mode: 'none',
      channels: [],
    },
  },
} as const satisfies Record<string, NotificationDefinition>

type NotificationDefinitions = typeof notificationDefinitions

export type NotificationCatalogKind = keyof NotificationDefinitions

export type NotificationKind = {
  [K in NotificationCatalogKind]: NotificationDefinitions[K]['source'] extends 'personal'
    ? K
    : never
}[NotificationCatalogKind]

export type BroadcastNotificationKind = {
  [K in NotificationCatalogKind]: NotificationDefinitions[K]['source'] extends 'broadcast'
    ? K
    : never
}[NotificationCatalogKind]

type NotificationCatalogPayloads = {
  [K in NotificationCatalogKind]: v.InferOutput<
    NotificationDefinitions[K]['payloadSchema']
  >
}

export type NotificationPayloads = {
  [K in NotificationKind]: NotificationCatalogPayloads[K]
}

export type BroadcastPayloads = {
  [K in BroadcastNotificationKind]: NotificationCatalogPayloads[K]
}

export type NotificationCatalogItem<K extends NotificationCatalogKind> = {
  kind: K
  source: NotificationDefinitions[K]['source']
  metadata: NotificationDefinitions[K]['metadata']
  ui: NotificationDefinitions[K]['ui']
  delivery: NotificationDefinitions[K]['delivery']
}

export const notificationCatalog = Object.fromEntries(
  Object.entries(notificationDefinitions).map(([kind, definition]) => [
    kind,
    {
      kind: definition.kind,
      source: definition.source,
      metadata: definition.metadata,
      ui: definition.ui,
      delivery: definition.delivery,
    },
  ]),
) as {
  [K in NotificationCatalogKind]: NotificationCatalogItem<K>
}

const personalNotificationKinds = Object.entries(notificationDefinitions)
  .filter(([, definition]) => definition.source === 'personal')
  .map(([kind]) => kind as NotificationKind)

const notificationConfigs = Object.fromEntries(
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

// Backward-compatible exports used by existing services/types.
export { channelConfigs, notificationConfigs, notificationDefinitions }

// Type to get supported channels for a notification kind
export type SupportedChannels<K extends NotificationKind> =
  NotificationDefinitions[K]['delivery']['channels'][number]

// Type to get supported notifications for a channel
export type SupportedNotifications<C extends ChannelType> = {
  [K in NotificationKind]: C extends NotificationDefinitions[K]['delivery']['channels'][number]
    ? K
    : never
}[NotificationKind]

// Utility to check if a channel supports a notification at runtime
export function channelSupportsNotification(
  channel: ChannelType,
  kind: NotificationKind,
): boolean {
  return notificationDefinitions[kind].delivery.channels.includes(
    channel as ChannelType,
  )
}
