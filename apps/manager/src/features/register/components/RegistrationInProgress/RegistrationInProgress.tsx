'use client'

import type { registrationMachine } from '@ens-apps/transaction-manager'
import { useSelector } from '@xstate/react'
import type { ActorRefFrom } from 'xstate'
import { calculateExpirationDate } from '@/features/register/components/Pricing/utils'
import type { NotificationPreferences } from '@/features/register/components/RegistrationInProgress/NotificationSettings'
import { NotificationSettings } from '@/features/register/components/RegistrationInProgress/NotificationSettings'
import {
  ProgressBar,
  type ProgressStage,
} from '@/features/register/components/RegistrationInProgress/ProgressBar'
import { RegistrationDetails } from '@/features/register/components/RegistrationInProgress/RegistrationDetails'

interface RegistrationInProgressProps {
  domainName: string
  actor: ActorRefFrom<typeof registrationMachine>
  duration: number
  totalPrice: number
  discountAmount: number
  registerWaitSeconds?: number | null
  onNotificationConfirm?: (preferences: NotificationPreferences) => void
  onNotificationSkip?: () => void
  onGoToDashboard?: () => void
  onCreateProfile?: () => void
  showRegistrationDetails?: boolean
}

/**
 * Maps machine state to progress bar stage
 * Handles both simple string states and nested states (like error.submission)
 */
function mapMachineStateToProgressStage(
  stateValue: string | Record<string, any>,
): ProgressStage {
  // Handle nested error states
  if (typeof stateValue === 'object' && 'error' in stateValue) {
    return 'error'
  }

  // Convert to string for simple state matching
  const machineState = String(stateValue)

  switch (machineState) {
    case 'preparingCommitment':
    case 'committingTransaction':
    case 'waitingForCommitment':
    case 'commitmentCooldown':
    case 'validatingCommitment':
      return 'name-registering'
    case 'approvingToken':
    case 'waitingForApproval':
      return 'approving'
    case 'registeringDomain':
    case 'waitingForRegistration':
      return 'registering'
    case 'success':
      return 'complete'
    case 'error':
      return 'error'
    default:
      return 'name-registering'
  }
}

export const RegistrationInProgress = ({
  domainName,
  actor,
  duration,
  totalPrice,
  discountAmount,
  onNotificationConfirm,
  onNotificationSkip,
  onGoToDashboard,
  onCreateProfile,
  showRegistrationDetails = false,
}: RegistrationInProgressProps) => {
  // Get the raw state value (can be string or object for nested states)
  const stateValue = useSelector(actor, (state) => {
    console.log('🔍 [REGISTRATION IN PROGRESS] Current state:', {
      value: state.value,
      valueType: typeof state.value,
      hasError: !!state.context.error,
      errorMessage: state.context.error?.message,
    })
    return state.value
  })

  const error = useSelector(actor, (state) => {
    const error = state.context.error
    if (error) {
      console.log('❌ [REGISTRATION IN PROGRESS] Error detected:', {
        message: error.message,
        name: error.name,
        state: state.value,
      })
    }
    return error
  })

  const progressStage = mapMachineStateToProgressStage(stateValue)
  const isRegistrationComplete = stateValue === 'success'

  const expiresDate = calculateExpirationDate(duration)

  const handleNotificationConfirm = (preferences: NotificationPreferences) => {
    onNotificationConfirm?.(preferences)
  }

  const handleNotificationSkip = () => {
    onNotificationSkip?.()
  }

  console.log('🎯 [REGISTRATION IN PROGRESS] Current stage:', {
    stateValue,
    progressStage,
    hasError: !!error,
    isComplete: isRegistrationComplete,
  })

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-0 pt-10 pb-6 md:px-6">
      <ProgressBar
        stage={progressStage}
        machineState={typeof stateValue === 'string' ? stateValue : 'error'}
        error={error}
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {showRegistrationDetails ? (
          <RegistrationDetails
            isRegistrationComplete={isRegistrationComplete}
            domainName={domainName}
            duration={duration}
            totalPrice={totalPrice}
            discountAmount={discountAmount}
            expiresDate={expiresDate}
            onGoToDashboard={onGoToDashboard}
            onCreateProfile={onCreateProfile}
          />
        ) : (
          <NotificationSettings
            onConfirm={handleNotificationConfirm}
            onSkip={handleNotificationSkip}
          />
        )}
      </div>
    </div>
  )
}
