import type { InferResponseType } from 'hono'
import type { backendClient } from '@/utils/backend-client'

// Channel types from backend
export type Channel = InferResponseType<
  typeof backendClient.notifications.channels.$get
>[number]

// Channel creation types
export interface EmailChannelData {
  email: string
}

export interface TelegramChannelData {
  auth_data: any // Will be properly typed from telegram types
}

// Channel form props
export interface ChannelFormProps {
  onSuccess: () => void
  onCancel: () => void
}
