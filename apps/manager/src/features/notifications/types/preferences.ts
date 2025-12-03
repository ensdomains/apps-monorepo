import type { InferResponseType } from 'hono'
import type { backendClient } from '@/utils/backend-client'

// Backend types
export type NotificationKind = InferResponseType<
  typeof backendClient.notifications.preferences.kinds.$get
>['kinds'][number]

export type PreferencesResponse = InferResponseType<
  typeof backendClient.notifications.preferences.$get
>

export type PreferenceUpdateRequest = {
  channel: string
  enabled: boolean
}

export type BatchPreferencesRequest = Record<string, Record<string, boolean>>

// Frontend types
export type ChannelType = 'email' | 'telegram' | 'web_push'

export type PreferenceState = {
  [channel in ChannelType]?: {
    [kind: string]: boolean
  }
}

export interface NotificationKindWithIcon extends NotificationKind {
  icon?: React.ComponentType<{ className?: string }>
}

export interface PreferencesGroup {
  category: string
  kinds: NotificationKindWithIcon[]
}
