import type { Address } from 'viem'
import { RegistrationV2ErrorState } from './states/RegistrationV2ErrorState'
import { RegistrationV2LoadingState } from './states/RegistrationV2LoadingState'
import { RegistrationV2ReadyState } from './states/RegistrationV2ReadyState'
import { RegistrationV2SuccessState } from './states/RegistrationV2SuccessState'
import { RegistrationV2TransactionState } from './states/RegistrationV2TransactionState'
import { RegistrationV2UnavailableState } from './states/RegistrationV2UnavailableState'

interface RegistrationV2ViewProps {
  targetName: string
  uiState: 'editing' | 'registering' | 'success' | 'failure'
  availabilityState: 'loading' | 'available' | 'unavailable' | 'error'
  availabilityMessage?: string
  pricingText: string
  durationYears: number
  selectedToken: Address
  registrationActorState: string
  onSetDuration: (durationYears: number) => void
  onSetToken: (token: Address) => void
}

export const RegistrationV2View = ({
  targetName,
  uiState,
  availabilityState,
  availabilityMessage,
  pricingText,
  durationYears,
  selectedToken,
  registrationActorState,
  onSetDuration,
  onSetToken,
}: RegistrationV2ViewProps) => {
  if (availabilityState === 'loading') {
    return <RegistrationV2LoadingState targetName={targetName} />
  }

  if (availabilityState === 'error') {
    return (
      <RegistrationV2ErrorState
        message={availabilityMessage ?? 'Failed to load registration data.'}
        targetName={targetName}
      />
    )
  }

  if (availabilityState === 'unavailable') {
    return (
      <RegistrationV2UnavailableState
        message={availabilityMessage ?? 'This name is not available.'}
        targetName={targetName}
      />
    )
  }

  if (uiState === 'registering') {
    return (
      <RegistrationV2TransactionState
        actorState={registrationActorState}
        targetName={targetName}
      />
    )
  }

  if (uiState === 'success') {
    return <RegistrationV2SuccessState targetName={targetName} />
  }

  if (uiState === 'failure') {
    return (
      <RegistrationV2ErrorState
        message={availabilityMessage ?? 'Registration failed.'}
        targetName={targetName}
      />
    )
  }

  return (
    <RegistrationV2ReadyState
      durationYears={durationYears}
      onSetDuration={onSetDuration}
      onSetToken={onSetToken}
      pricingText={pricingText}
      selectedToken={selectedToken}
      targetName={targetName}
    />
  )
}
