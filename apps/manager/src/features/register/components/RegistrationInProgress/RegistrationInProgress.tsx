'use client'

import type { registrationMachine } from '@ens-apps/transaction-manager'
import { useSelector } from '@xstate/react'
import type { ActorRefFrom } from 'xstate'
import { calculateExpirationDate } from '@/features/register/components/Pricing/utils'
import {
  ProgressBar,
  type ProgressStage,
} from '@/features/register/components/RegistrationInProgress/ProgressBar'
import { RegistrationDetails } from '@/features/register/components/RegistrationInProgress/RegistrationDetails'
import { NotificationSettings } from '@/features/register-v2/workflow/registering/components/NotificationSettings'

interface RegistrationInProgressProps {
  domainName: string
  actor: ActorRefFrom<typeof registrationMachine>
  duration: number
  totalPrice: number
  discountAmount: number
  registerWaitSeconds?: number | null
  onNotificationConfirm?: () => void
  onNotificationSkip?: () => void
  onGoToDashboard?: () => void
  onProfileNavigate?: () => void
  showRegistrationDetails?: boolean
}

const noop = () => {}

function mapMachineStateToProgressStage(
  stateValue: string | Record<string, unknown>,
): ProgressStage {
  if (typeof stateValue === 'object' && 'error' in stateValue) {
    return 'error'
  }

  const machineState = String(stateValue)

  switch (machineState) {
    case 'settingUpRegistration':
    case 'deployingResolver':
    case 'waitingForResolverDeployment':
    case 'preparingCommitment':
    case 'committingTransaction':
    case 'waitingForCommitment':
    case 'commitmentCooldown':
    case 'validatingCommitment':
      return 'name-registering'
    case 'approvingToken':
    case 'waitingForApproval':
    case 'submittingRhinestoneBundle':
      return 'approving'
    case 'waitingForRhinestoneBundle':
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
  onNotificationConfirm = noop,
  onNotificationSkip = noop,
  onGoToDashboard,
  onProfileNavigate,
  showRegistrationDetails = false,
}: RegistrationInProgressProps) => {
  const stateValue = useSelector(actor, (state) => state.value)

  const error = useSelector(actor, (state) => state.context.error)

  const progressStage = mapMachineStateToProgressStage(stateValue)
  const isRegistrationComplete = stateValue === 'success'

  const expiresDate = calculateExpirationDate(duration)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-0 pt-10 pb-6 md:px-6">
      <ProgressBar
        error={error}
        machineState={typeof stateValue === 'string' ? stateValue : 'error'}
        stage={progressStage}
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        {showRegistrationDetails || isRegistrationComplete ? (
          <RegistrationDetails
            discountAmount={discountAmount}
            domainName={domainName}
            duration={duration}
            expiresDate={expiresDate}
            isRegistrationComplete={isRegistrationComplete}
            onGoToDashboard={onGoToDashboard}
            onProfileNavigate={onProfileNavigate}
            totalPrice={totalPrice}
          />
        ) : (
          <NotificationSettings
            onConfirm={onNotificationConfirm}
            onSkip={onNotificationSkip}
          />
        )}
      </div>
    </div>
  )
}
