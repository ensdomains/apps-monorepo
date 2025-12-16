import type { InferRequestType, InferResponseType } from 'hono'
import type { backendClient } from '@/utils/backend-client'

// Backend types
export type PreferencesResponse = InferResponseType<
  typeof backendClient.notifications.preferences.$get
>

export type PreferenceUpdateRequest = InferRequestType<
  (typeof backendClient.notifications.preferences)[':kind']['$patch']
>['json']

export type BatchPreferencesRequest = Record<string, Record<string, boolean>>

// Frontend types
export type ChannelType = 'email' | 'telegram'

export type PreferenceState = {
  [channel in ChannelType]?: {
    [kind: string]: boolean
  }
}
