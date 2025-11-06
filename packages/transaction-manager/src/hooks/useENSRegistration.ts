import { useActorRef, useSelector } from '@xstate/react'
import { useEffect, useMemo } from 'react'
import type { PublicClient } from 'viem'
import type { ENSRegistrationParams } from '../machines/ens-registration.helpers'
import { ensRegistrationMachine } from '../machines/ens-registration.machine'
import type { Signer } from '../types/signer.types'
import type { TransactionOptions } from '../types/transaction.types'

export interface UseENSRegistrationOptions {
  params: ENSRegistrationParams
  publicClient: PublicClient
  signer: Signer
  options?: TransactionOptions
  onSuccess?: () => void
  onError?: (error: Error) => void
}

export function useENSRegistration({
  params,
  publicClient,
  signer,
  options,
  onSuccess,
  onError,
}: UseENSRegistrationOptions) {
  // Create actor once
  const actor = useActorRef(ensRegistrationMachine, {
    input: {
      params,
      publicClient,
      signer,
      options,
    },
  })

  const state = useSelector(actor, (snapshot) => snapshot)
  const send = actor.send

  // Call callbacks when reaching terminal states
  if (state.matches('success') && onSuccess) {
    onSuccess()
  }

  if (state.matches('error') && onError && state.context.error) {
    onError(state.context.error)
  }

  return {
    // State machine state
    state,
    send,

    // Convenience getters
    isIdle: state.matches('idle'),
    isPreparing: state.matches('preparing'),
    isCheckingApproval: state.matches('checkingApproval'),
    isApprovingToken: state.matches('approvingToken'),
    isCommitting: state.matches('committing'),
    isWaitingForCommit: state.matches('waitingForCommit'),
    isWaiting: state.matches('waiting'),
    isRegistering: state.matches('registering'),
    isWaitingForRegister: state.matches('waitingForRegister'),
    isSuccess: state.matches('success'),
    isError: state.matches('error'),

    // Context data
    secret: state.context.secret,
    commitment: state.context.commitment,
    pricing: state.context.pricing,
    approvalHash: state.context.approvalHash,
    commitHash: state.context.commitHash,
    registerHash: state.context.registerHash,
    error: state.context.error,

    // Actions
    start: () => send({ type: 'START' }),
    retry: () => send({ type: 'RETRY' }),
    cancel: () => send({ type: 'CANCEL' }),
    proceedToRegister: () => send({ type: 'PROCEED_TO_REGISTER' }),
  }
}
