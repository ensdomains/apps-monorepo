import { StepIndicator } from '../../../shared/step-indicator'
import { TelegramAuthStep } from './telegram-auth-step'
import { TelegramCreateStep } from './telegram-create-step'
import type { TelegramStepProps } from './types'

export function TelegramSteps({ state, actions }: TelegramStepProps) {
  const { currentStep, telegramAuthData, isChannelCreated } = state

  const getCurrentStepNumber = () => {
    return currentStep === 'auth' ? 1 : 2
  }

  const getCompletedSteps = () => {
    const completed: number[] = []
    if (telegramAuthData) completed.push(1)
    if (isChannelCreated) completed.push(2)
    return completed
  }

  return (
    <div className="space-y-4">
      <StepIndicator
        completedSteps={getCompletedSteps()}
        currentStep={getCurrentStepNumber()}
        totalSteps={2}
      />

      {currentStep === 'auth' && (
        <TelegramAuthStep actions={actions} state={state} />
      )}

      {currentStep === 'create' && (
        <TelegramCreateStep actions={actions} state={state} />
      )}
    </div>
  )
}
