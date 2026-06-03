import type { RegistrationMachineActor } from '@ens-apps/transaction-manager'
import {
  REGISTRATION_TX_IDS,
  registrationMachine,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { getWalletClient } from '@wagmi/core/actions'
import { useActorRef, useSelector } from '@xstate/react'
import { useCallback, useMemo, useState } from 'react'
import { type Address, erc20Abi } from 'viem'
import {
  useConfig,
  useConnection,
  usePublicClient,
  useReadContract,
} from 'wagmi'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { sepoliaWithEns } from '@/lib/wagmi'

const ethRegistrar = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

type UseRegistrationTransactionsParams = {
  readonly name: string
  readonly duration: number
}

type SavedRegistrationParams = {
  readonly tokenSymbol: 'USDC' | 'DAI'
  readonly tokenAddress: Address
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
  // Surface the commit-reveal cooldown to the modal. Approval can happen at
  // any time; only the actual register call is gated by MIN_COMMITMENT_AGE,
  // so attach the deadline to the register step.
  const registerWaitUntil =
    machineState === 'fetchingCommitmentAge' ||
    machineState === 'commitmentCooldown' ||
    machineState === 'checkingAllowance' ||
    machineState === 'approvingToken' ||
    machineState === 'waitingForApproval'
      ? registerReadyTimestamp
      : undefined
  const isSuccess = machineState === 'success'
  const isRegistering = isInProgressState(machineState)

  // Read existing allowance for the chosen token so we can omit the approval
  // step entirely when the user has already approved enough.
  const allowanceQuery = useReadContract({
    address: savedParams?.tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args:
      connection.address && savedParams
        ? [connection.address as Address, ethRegistrar]
        : undefined,
    query: {
      enabled: Boolean(savedParams && connection.address),
    },
  })
  const needsApproval =
    !savedParams ||
    allowanceQuery.data === undefined ||
    allowanceQuery.data < savedParams.tokenPrice

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

  const transactions: Transaction[] = useMemo(() => {
    const steps: Transaction[] = [
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
    ]

    if (needsApproval) {
      steps.push({
        id: REGISTRATION_TX_IDS.approve,
        title: 'Approve payment',
        transactionName: `Approve ${savedParams?.tokenSymbol ?? 'token'} for registration`,
        estimatedGasCost: 0.0003,
        onStart: handleProceed,
        onDone: handleProceed,
      })
    }

    steps.push({
      id: REGISTRATION_TX_IDS.register,
      title: 'Register name',
      transactionName: `Register ${name}`,
      estimatedGasCost: 0.001,
      onStart: handleProceed,
      onDone: handleDone,
      waitUntil: registerWaitUntil,
    })

    return steps
  }, [
    name,
    savedParams?.tokenSymbol,
    needsApproval,
    registerWaitUntil,
    handleStart,
    handleProceed,
    handleDone,
  ])

  const startFlow = (selectedTokenAddress: Address, tokenPrice: bigint) => {
    const tokenInfo = getTokenMetadataWithAddress(selectedTokenAddress)
    setSavedParams({
      tokenSymbol: tokenInfo.symbol,
      tokenAddress: selectedTokenAddress,
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
