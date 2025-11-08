/**
 * ENS Registration Hook - XState Machine Integration
 *
 * Wraps the registration state machine from transaction-manager
 * and exposes a compatible API for the RegistrationPage component.
 */

// @ts-expect-error - Type imports not available due to dts generation being disabled
import type {
  RegistrationContext,
  RegistrationEvent,
} from '@ens-apps/transaction-manager'
import { registrationMachine } from '@ens-apps/transaction-manager'
import { useMachine } from '@xstate/react'
import React, { useCallback, useEffect, useMemo } from 'react'
import { useRhinestoneAccount } from '@/lib/rhinestone/useRhinestoneAccount'
import { publicClient } from '@/lib/wagmi'
import { SUPPORTED_TOKENS } from '../services/nameChainContractService'

// ============================================================================
// TYPES
// ============================================================================

export enum RegistrationStep {
  PRICING = 'pricing',
  COMMITTING = 'committing',
  APPROVING = 'approving',
  REGISTERING = 'registering',
  SUCCESS = 'success',
  AUTORENEWAL = 'autorenewal',
  ERROR = 'error',
}

// ============================================================================
// HELPER: Map machine state to RegistrationStep
// ============================================================================

function mapMachineStateToStep(machineState: string): RegistrationStep {
  switch (machineState) {
    case 'idle':
      return RegistrationStep.PRICING
    case 'preparingCommitment':
    case 'committingTransaction':
    case 'waitingForCommitment':
      return RegistrationStep.COMMITTING
    case 'approvingToken':
    case 'waitingForApproval':
      return RegistrationStep.APPROVING
    case 'registeringDomain':
    case 'waitingForRegistration':
      return RegistrationStep.REGISTERING
    case 'success':
      return RegistrationStep.SUCCESS
    case 'error':
      return RegistrationStep.ERROR
    default:
      return RegistrationStep.PRICING
  }
}

// ============================================================================
// HOOK
// ============================================================================

export function useRegistration(initialName?: string) {
  const { rhinestoneAccount, accountAddress, isConnected, rhinestoneConfig } =
    useRhinestoneAccount()

  // UI state (not in machine) - used for pricing page
  const [uiName, setUiName] = React.useState(initialName || '')
  const [uiDuration, setUiDuration] = React.useState(1) // years
  const [uiSelectedToken, setUiSelectedToken] = React.useState<`0x${string}`>(
    SUPPORTED_TOKENS.USDC,
  )

  // Wait for account to be ready before initializing machine
  const isAccountReady = Boolean(
    rhinestoneAccount && accountAddress && rhinestoneConfig,
  )

  // Initialize machine with minimal input
  // Account details will be sent via UPDATE_ACCOUNT event when ready
  const [state, send] = useMachine(registrationMachine, {
    input: {
      chainId: 11155111, // Sepolia
    },
  })

  // Map machine state to RegistrationStep
  const step = useMemo(() => {
    // If account not ready, stay on pricing step
    if (!isAccountReady) {
      return RegistrationStep.PRICING
    }
    return mapMachineStateToStep(String(state.value))
  }, [state.value, isAccountReady])

  // Sync initial name to UI state
  useEffect(() => {
    if (initialName && initialName !== uiName) {
      setUiName(initialName)
    }
  }, [initialName, uiName])

  // Update machine context when account becomes ready
  useEffect(() => {
    if (
      isAccountReady &&
      rhinestoneAccount &&
      accountAddress &&
      rhinestoneConfig
    ) {
      console.log('📤 Sending UPDATE_ACCOUNT event to machine', {
        accountAddress,
        hasRhinestoneAccount: !!rhinestoneAccount,
        hasPublicClient: !!publicClient,
        hasRhinestoneConfig: !!rhinestoneConfig,
      })
      send({
        type: 'UPDATE_ACCOUNT',
        rhinestoneAccount,
        accountAddress: accountAddress as `0x${string}`,
        publicClient,
        rhinestoneConfig,
      } as RegistrationEvent)
    }
  }, [
    isAccountReady,
    rhinestoneAccount,
    accountAddress,
    publicClient,
    rhinestoneConfig,
    send,
  ])

  // Handlers
  const startCommitment = useCallback(
    (params: { tokenPrice: bigint; selectedToken?: `0x${string}` }) => {
      console.log('🔍 startCommitment called with:', {
        accountAddress,
        rhinestoneAccount: !!rhinestoneAccount,
        params,
      })

      if (!accountAddress || !rhinestoneAccount) {
        console.error('❌ Account not connected or not initialized', {
          accountAddress,
          hasRhinestoneAccount: !!rhinestoneAccount,
        })
        alert('Account not ready. Please wait for wallet to connect.')
        return
      }

      const token =
        params.selectedToken === SUPPORTED_TOKENS.DAI ? 'DAI' : 'USDC'
      const durationInSeconds = BigInt(uiDuration * 365 * 24 * 60 * 60) // Convert years to seconds

      console.log('✅ Sending START_REGISTRATION event:', {
        name: uiName,
        duration: durationInSeconds,
        token,
        price: params.tokenPrice,
      })

      send({
        type: 'START_REGISTRATION',
        name: uiName,
        duration: durationInSeconds,
        token,
        price: params.tokenPrice,
      } as RegistrationEvent)
    },
    [accountAddress, rhinestoneAccount, uiName, uiDuration, send],
  )

  const retry = useCallback(() => {
    send({ type: 'RETRY' } as RegistrationEvent)
  }, [send])

  const reset = useCallback(() => {
    send({ type: 'CANCEL' } as RegistrationEvent)
    // Also reset UI state
    setUiName(initialName || '')
    setUiDuration(1)
    setUiSelectedToken(SUPPORTED_TOKENS.USDC)
  }, [send, initialName])

  const handleSetupAutorenewal = useCallback(() => {
    // TODO: Implement autorenewal flow
    // For now, this is a no-op
  }, [])

  const handleRegisterAnotherName = useCallback(() => {
    reset()
  }, [reset])

  const setDuration = useCallback((duration: number) => {
    setUiDuration(duration)
  }, [])

  const setName = useCallback((name: string) => {
    setUiName(name)
  }, [])

  const setSelectedToken = useCallback((token: `0x${string}`) => {
    setUiSelectedToken(token)
  }, [])

  // @ts-expect-error - Context types not available due to dts generation being disabled
  const context = state.context as RegistrationContext

  return {
    step,
    name: context.name || uiName, // Use machine context name if available, otherwise UI name
    duration: uiDuration,
    selectedToken: uiSelectedToken, // Use UI token for consistency
    commitTxHash: context.commitmentTxId
      ? { hash: context.commitmentTxId as `0x${string}` }
      : null,
    registerTxHash: context.registrationTxId
      ? { hash: context.registrationTxId as `0x${string}` }
      : null,
    error: context.error?.message || null,
    isConnected,
    isCommitting: step === RegistrationStep.COMMITTING,
    isApproving: step === RegistrationStep.APPROVING,
    isRegistering: step === RegistrationStep.REGISTERING,
    isSuccess: step === RegistrationStep.SUCCESS,
    isAutorenewal: step === RegistrationStep.AUTORENEWAL,
    isError: step === RegistrationStep.ERROR,
    startCommitment,
    setDuration,
    setName,
    setSelectedToken,
    retry,
    reset,
    handleSetupAutorenewal,
    handleRegisterAnotherName,
  }
}
