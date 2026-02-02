import type { InferRequestType, InferResponseType } from 'hono'
import type { backendClient } from '@/utils/backend-client'

// Backend types
export type PreferencesResponse = InferResponseType<
  typeof backendClient.notifications.preferences.$get
>

export type PreferenceUpdateRequest = InferRequestType<
  typeof backendClient.notifications.preferences.$patch
>['json']

// Frontend types
export type ChannelType = 'email' | 'telegram'
