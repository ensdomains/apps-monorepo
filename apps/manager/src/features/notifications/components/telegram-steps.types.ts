import type { TelegramAuthData } from 'api-worker/types/telegram'

export type TelegramStep = 'auth' | 'create'

export interface TelegramStepState {
  currentStep: TelegramStep
  telegramAuthData: TelegramAuthData | null
  isAuthenticating: boolean
  authError: string | null
  isCreatingChannel: boolean
  isChannelCreated: boolean
  channelError: string | null
}

export interface TelegramStepActions {
  onTelegramAuth: () => void
  onCreateChannel: () => void
  onBackToAuth: () => void
  onCancel: () => void
}

export interface TelegramStepProps {
  state: TelegramStepState
  actions: TelegramStepActions
}
