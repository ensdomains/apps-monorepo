import { useMutation } from '@tanstack/react-query'
import type { TelegramAuthData } from 'api-worker/types'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  addTelegramChannelMutationOptions,
  telegramAuthMutationOptions,
} from '../../../queries/channels'
import { TelegramSteps } from './steps/telegram-steps'
import type {
  TelegramStep,
  TelegramStepActions,
  TelegramStepState,
} from './steps/types'

interface TelegramChannelFormProps {
  onSuccess: () => void
  onCancel: () => void
}

export const TelegramChannelForm = ({
  onSuccess,
  onCancel,
}: TelegramChannelFormProps) => {
  const [currentStep, setCurrentStep] = useState<TelegramStep>('auth')
  const [telegramAuthData, setTelegramAuthData] =
    useState<TelegramAuthData | null>(null)

  const telegramAuthMutation = useMutation({
    ...telegramAuthMutationOptions,
    onSuccess: (authData) => {
      setTelegramAuthData(authData)
      setCurrentStep('create')
      toast.success('Telegram authentication successful!')
    },
    onError: (error) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      if (errorMessage === 'Popup blocked') {
        toast.error('Please allow popups to connect Telegram')
      } else if (errorMessage === 'Popup closed before authentication') {
        toast.error('Telegram authentication was cancelled')
      } else {
        toast.error('Failed to authenticate with Telegram')
      }
    },
  })

  const addTelegramChannelMutation = useMutation({
    ...addTelegramChannelMutationOptions,
    onSuccess: () => {
      toast.success('Telegram notification channel created successfully!')
      onSuccess()
    },
    onError: (error) => {
      console.error('Telegram channel creation error:', error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to create Telegram channel'
      toast.error(errorMessage)
    },
  })

  const handleTelegramAuth = () => {
    telegramAuthMutation.mutate()
  }

  const handleCreateChannel = () => {
    if (telegramAuthData) {
      addTelegramChannelMutation.mutate({ auth_data: telegramAuthData })
    }
  }

  const handleBackToAuth = () => {
    setCurrentStep('auth')
    setTelegramAuthData(null)
    telegramAuthMutation.reset()
  }

  const state: TelegramStepState = {
    currentStep,
    telegramAuthData,
    isAuthenticating: telegramAuthMutation.isPending,
    authError: telegramAuthMutation.error?.message || null,
    isCreatingChannel: addTelegramChannelMutation.isPending,
    isChannelCreated: addTelegramChannelMutation.isSuccess,
    channelError: addTelegramChannelMutation.error?.message || null,
  }

  const actions: TelegramStepActions = {
    onTelegramAuth: handleTelegramAuth,
    onCreateChannel: handleCreateChannel,
    onBackToAuth: handleBackToAuth,
    onCancel,
  }

  return <TelegramSteps actions={actions} state={state} />
}
