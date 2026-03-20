import type { RegistrationMachineActor } from '@ens-apps/transaction-manager'
import {
  REGISTRATION_TX_IDS,
  registrationMachine,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { getWalletClient } from '@wagmi/core/actions'
import { useActorRef, useSelector } from '@xstate/react'
import { useCallback, useState } from 'react'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { useConfig, useConnection, usePublicClient } from 'wagmi'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'

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
  if (typeof stateValue === 'object') return false // error state
  return (
    stateValue !== 'idle' && stateValue !== 'success' && stateValue !== 'error'
  )
}

export const useRegistrationTransactions = ({
  name,
  duration,
}: UseRegistrationTransactionsParams) => {
  const chainId = sepolia.id
  const config = useConfig()
  const connection = useConnection()
  const publicClient = usePublicClient({ chainId })

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
  const isSuccess = machineState === 'success'
  const isRegistering = isInProgressState(machineState)

  // Called by first transaction's onStart — sends START_REGISTRATION to the machine
  const handleStart = useCallback(async () => {
    if (!publicClient || !connection.address || !savedParams) return

    const walletClient = await getWalletClient(config, {
      connector: connection.connector,
      account: connection.address,
    })
    if (!walletClient) return

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
      useFastRegistrar: true,
      sponsored: false,
    })
  }, [actor, name, duration, publicClient, connection, config, savedParams])

  const handleDone = useCallback(() => {
    closeModal()
    clearTransaction()
  }, [closeModal, clearTransaction])

  // No-op for auto-advancing steps — machine handles transitions
  const noop = useCallback(() => {}, [])

  const transactions: Transaction[] = [
    {
      id: REGISTRATION_TX_IDS.deployResolver,
      title: 'Deploy resolver',
      transactionName: `Deploy resolver for ${name}`,
      estimatedGasCost: 0.001,
      onStart: handleStart,
      onDone: noop,
    },
    {
      id: REGISTRATION_TX_IDS.commit,
      title: 'Submit commitment',
      transactionName: `Commit to register ${name}`,
      estimatedGasCost: 0.0005,
      onStart: noop,
      onDone: noop,
    },
    {
      id: REGISTRATION_TX_IDS.approve,
      title: 'Approve payment',
      transactionName: `Approve ${savedParams?.tokenSymbol ?? 'token'} for registration`,
      estimatedGasCost: 0.0003,
      onStart: noop,
      onDone: noop,
    },
    {
      id: REGISTRATION_TX_IDS.register,
      title: 'Register name',
      transactionName: `Register ${name}`,
      estimatedGasCost: 0.001,
      onStart: noop,
      onDone: handleDone,
    },
  ]

  // Called when user clicks Register — saves params for handleStart, opens modal
  const startFlow = useCallback(
    (selectedTokenAddress: Address, tokenPrice: bigint) => {
      const tokenInfo = getTokenMetadataWithAddress(selectedTokenAddress)
      setSavedParams({
        tokenSymbol: tokenInfo.symbol,
        tokenPrice,
      })
    },
    [],
  )

  return {
    transactions,
    actor,
    isRegistering,
    isSuccess,
    selectedToken,
    startFlow,
  }
}
