type ChannelConfig = {
  label: string
  requiresVerification: boolean
  supportsRichContent: boolean
  batchable: boolean
}

export const channelConfigs = {
  email: {
    label: 'Email',
    requiresVerification: true,
    supportsRichContent: true,
    batchable: true,
  },
  telegram: {
    label: 'Telegram',
    requiresVerification: true,
    supportsRichContent: true,
    batchable: false,
  },
  push: {
    label: 'Push Notification',
    requiresVerification: true,
    supportsRichContent: false,
    batchable: false,
  },
} as const satisfies Record<string, ChannelConfig>

export type ChannelType = keyof typeof channelConfigs
