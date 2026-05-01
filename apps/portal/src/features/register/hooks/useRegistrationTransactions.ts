import type { RegistrationMachineActor } from '@ens-apps/transaction-manager'
import {
  REGISTRATION_TX_IDS,
  registrationMachine,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { getWalletClient } from '@wagmi/core/actions'
import { useActorRef, useSelector } from '@xstate/react'
import { useCallback, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { useConfig, useConnection, usePublicClient } from 'wagmi'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { sepoliaWithEns } from '@/lib/wagmi'

type UseRegistrationTransactionsParams = {
  readonly name: string
  readonly duration: number
}

type SavedRegistrationParams = {
  readonly tokenSymbol: 'USDC' | 'DAI'
  readonly tokenPrice: bigint
}

/** Map machine states to whether registration is actively in progress */
function isInProgressState(
  stateValue: string | Record<string, unknown>,
): boolean {
  if (typeof stateValue === 'object') return false

  return (
    stateValue !== 'idle' && stateValue !== 'success' && stateValue !== 'error'
  )
}

export const useRegistrationTransactions = ({
  name,
  duration,
}: UseRegistrationTransactionsParams) => {
  const chainId = sepoliaWithEns.id
  const config = useConfig()
  const connection = useConnection()
  const publicClient = usePublicClient()

  const { closeModal, clearTransaction } = useTransactionModal()

  const [savedParams, setSavedParams] =
    useState<SavedRegistrationParams | null>(null)

  const actor: RegistrationMachineActor = useActorRef(registrationMachine, {
    input: { chainId },
  })

  const machineState = useSelector(actor, (state) => state.value)
  const selectedToken = useSelector(
    actor,
    (state) => state.context.selectedToken,
  )
  const registerReadyTimestamp = useSelector(
    actor,
    (state) => state.context.registerReadyTimestamp,
  )
  // Surface the commit-reveal cooldown to the modal: while we're waiting for
  // MIN_COMMITMENT_AGE to elapse the next user-facing step is the approval, so
  // attach the deadline to that step.
  const approveWaitUntil =
    machineState === 'fetchingCommitmentAge' ||
    machineState === 'commitmentCooldown' ||
    machineState === 'checkingAllowance'
      ? registerReadyTimestamp
      : undefined
  const isSuccess = machineState === 'success'
  const isRegistering = isInProgressState(machineState)

  const handleStart = useCallback(async () => {
    if (!publicClient || !connection.address || !savedParams) {
      throw new Error(
        'Missing required parameters - publicClient, connection.address, or savedParams',
      )
    }

    // Reset machine to idle if it's not already (e.g. after modal was closed on error)
    const currentState = actor.getSnapshot().value
    if (currentState !== 'idle') {
      actor.send({ type: 'CANCEL' })
    }

    const walletClient = await getWalletClient(config, {
      connector: connection.connector,
      account: connection.address,
    })

    if (!walletClient) {
      throw new Error('Failed to get wallet client')
    }

    transactionManager.clear()

    const signer = createEOASigner(walletClient)

    actor.send({
      type: 'START_REGISTRATION',
      name,
      duration: BigInt(duration),
      token: savedParams.tokenSymbol,
      price: savedParams.tokenPrice,
      signer,
      accountAddress: connection.address,
      publicClient,
      useFastRegistrar: false,
      sponsored: false,
    })
  }, [actor, name, duration, publicClient, connection, config, savedParams])

  const handleProceed = useCallback(() => {
    const currentState = actor.getSnapshot().value
    if (currentState === 'error') {
      transactionManager.clear()
      actor.send({ type: 'RETRY' })
    }
  }, [actor])

  const handleDone = useCallback(() => {
    closeModal()
    clearTransaction()
  }, [closeModal, clearTransaction])

  const transactions: Transaction[] = useMemo(
    () => [
      {
        id: REGISTRATION_TX_IDS.deployResolver,
        title: 'Deploy resolver',
        transactionName: `Deploy resolver for ${name}`,
        estimatedGasCost: 0.001,
        onStart: handleStart,
        onDone: handleProceed,
      },
      {
        id: REGISTRATION_TX_IDS.commit,
        title: 'Submit commitment',
        transactionName: `Commit to register ${name}`,
        estimatedGasCost: 0.0005,
        onStart: handleProceed,
        onDone: handleProceed,
      },
      {
        id: REGISTRATION_TX_IDS.approve,
        title: 'Approve payment',
        transactionName: `Approve ${savedParams?.tokenSymbol ?? 'token'} for registration`,
        estimatedGasCost: 0.0003,
        onStart: handleProceed,
        onDone: handleProceed,
        waitUntil: approveWaitUntil,
      },
      {
        id: REGISTRATION_TX_IDS.register,
        title: 'Register name',
        transactionName: `Register ${name}`,
        estimatedGasCost: 0.001,
        onStart: handleProceed,
        onDone: handleDone,
      },
    ],
    [
      name,
      savedParams?.tokenSymbol,
      approveWaitUntil,
      handleStart,
      handleProceed,
      handleDone,
    ],
  )

  const startFlow = (selectedTokenAddress: Address, tokenPrice: bigint) => {
    const tokenInfo = getTokenMetadataWithAddress(selectedTokenAddress)
    setSavedParams({
      tokenSymbol: tokenInfo.symbol,
      tokenPrice,
    })
  }

  const resetRegistration = useCallback(() => {
    actor.send({ type: 'CANCEL' })
    closeModal()
    clearTransaction()
  }, [actor, closeModal, clearTransaction])

  return {
    transactions,
    actor,
    isRegistering,
    isSuccess,
    selectedToken,
    startFlow,
    resetRegistration,
  }
}
