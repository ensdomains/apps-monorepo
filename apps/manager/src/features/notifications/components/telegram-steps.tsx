import { StepIndicator } from './step-indicator'
import { TelegramAuthStep } from './telegram-auth-step'
import { TelegramCreateStep } from './telegram-create-step'
import type { TelegramStepProps } from './telegram-steps.types'

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
        currentStep={getCurrentStepNumber()}
        totalSteps={2}
        completedSteps={getCompletedSteps()}
      />

      {currentStep === 'auth' && (
        <TelegramAuthStep state={state} actions={actions} />
      )}

      {currentStep === 'create' && (
        <TelegramCreateStep state={state} actions={actions} />
      )}
    </div>
  )
}
