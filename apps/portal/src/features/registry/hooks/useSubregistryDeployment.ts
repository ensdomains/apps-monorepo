import {
  type subregistryDeploymentMachine,
  type transactionMachine,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { setSubregistryWriteParameters } from '@ensdomains/ensjs/wallet'
import { useSelector } from '@xstate/react'
import { useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { encodeFunctionData } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import type { ActorRefFrom, SnapshotFrom } from 'xstate'
import {
  type SubregistryDeploymentActor,
  startSubregistryDeployment,
} from '@/features/registry/helpers/subregistry-deployment.helpers'
import type {
  TransactionState,
  UseSubregistryDeploymentParams,
} from '@/features/registry/types/subregistry.types'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import {
  isError,
  isHash,
  isTransactionReceipt,
} from '@/features/registry/utils/type-guards'
import { namechainSepolia } from '@/lib/wagmi'

const IDLE_STATE: TransactionState = { status: 'idle' }

type OperationSnapshot = SnapshotFrom<typeof subregistryDeploymentMachine>
type TransactionSnapshot = SnapshotFrom<typeof transactionMachine>

/**
 * Selector that extracts transaction state data from individual transaction actor snapshot.
 */
function selectTransactionData(snapshot: TransactionSnapshot | undefined) {
  if (!snapshot) return undefined

  const { value, context } = snapshot
  const stateString =
    typeof value === 'string' ? value : (Object.keys(value)[0] ?? 'idle')

  return {
    stateString,
    hash: isHash(context.hash) ? context.hash : undefined,
    receipt: isTransactionReceipt(context.receipt)
      ? context.receipt
      : undefined,
    error: isError(context.error) ? context.error : undefined,
  }
}

/**
 * Derives TransactionState from selected transaction data.
 */
function deriveTransactionState(
  data: ReturnType<typeof selectTransactionData>,
): TransactionState {
  if (!data) return IDLE_STATE

  const { stateString, hash, receipt, error } = data

  switch (stateString) {
    case 'submitting':
      return { status: 'submitting' }
    case 'pending':
    case 'confirming':
      return hash ? { status: 'pending', hash } : IDLE_STATE
    case 'success':
      return hash && receipt ? { status: 'success', hash, receipt } : IDLE_STATE
    case 'error':
      if (receipt?.status === 'reverted' && hash) {
        return { status: 'reverted', hash, receipt }
      }
      return error ? { status: 'error', error } : IDLE_STATE
    default:
      return IDLE_STATE
  }
}

/**
 * Selector that extracts the operation state value from the subregistry deployment machine.
 */
function selectOperationState(snapshot: OperationSnapshot | undefined) {
  if (!snapshot) {
    return {
      stateString: 'idle',
      deployTxId: undefined,
      deployedAddress: undefined,
      setSubregistryTxId: undefined,
      error: undefined,
    }
  }

  const { value, context } = snapshot
  const stateString =
    typeof value === 'string' ? value : (Object.keys(value)[0] ?? 'idle')

  return {
    stateString,
    deployTxId: context.deployTxId,
    deployedAddress: context.deployedAddress,
    setSubregistryTxId: context.setSubregistryTxId,
    error: context.error,
  }
}

/**
 * Get transaction state from a transaction ID.
 * Returns IDLE_STATE if txId is undefined or actor not found.
 */
function getTransactionStateFromId(
  txId: string | undefined,
  fallbackStatus?: 'pending',
): TransactionState {
  if (!txId) return IDLE_STATE

  const txActor = transactionManager.getTransaction(txId)
  if (!txActor) {
    return fallbackStatus === 'pending'
      ? { status: 'pending', hash: '0x' as `0x${string}` }
      : IDLE_STATE
  }

  const txSnapshot = txActor.getSnapshot()
  const txData = selectTransactionData(txSnapshot)
  return deriveTransactionState(txData)
}

/**
 * Derives deploy and setSubregistry transaction states from the operation state.
 */
function deriveStatesFromOperation(
  operationState: ReturnType<typeof selectOperationState>,
): { deployState: TransactionState; setSubregistryState: TransactionState } {
  const { stateString, deployTxId, setSubregistryTxId, error } = operationState

  return match(stateString)
    .with('idle', () => ({
      deployState: IDLE_STATE,
      setSubregistryState: IDLE_STATE,
    }))
    .with('deploying', () => ({
      deployState: { status: 'submitting' } as TransactionState,
      setSubregistryState: IDLE_STATE,
    }))
    .with('waitingForDeployment', () => ({
      deployState: getTransactionStateFromId(deployTxId, 'pending'),
      setSubregistryState: IDLE_STATE,
    }))
    .with('settingSubregistry', () => ({
      deployState: getTransactionStateFromId(deployTxId),
      setSubregistryState: { status: 'submitting' } as TransactionState,
    }))
    .with('waitingForSetSubregistry', () => ({
      deployState: getTransactionStateFromId(deployTxId),
      setSubregistryState: getTransactionStateFromId(
        setSubregistryTxId,
        'pending',
      ),
    }))
    .with('success', () => ({
      deployState: getTransactionStateFromId(deployTxId),
      setSubregistryState: getTransactionStateFromId(setSubregistryTxId),
    }))
    .with('error', () => {
      const deployState = getTransactionStateFromId(deployTxId)
      const setSubregistryState = getTransactionStateFromId(setSubregistryTxId)

      // If we have an error but no transaction-level error, show operation error
      if (error && deployState.status === 'idle') {
        return {
          deployState: { status: 'error', error } as TransactionState,
          setSubregistryState,
        }
      }
      if (
        error &&
        setSubregistryState.status === 'idle' &&
        deployState.status === 'success'
      ) {
        return {
          deployState,
          setSubregistryState: { status: 'error', error } as TransactionState,
        }
      }

      return { deployState, setSubregistryState }
    })
    .otherwise(() => ({
      deployState: IDLE_STATE,
      setSubregistryState: IDLE_STATE,
    }))
}

/**
 * Hook that manages subregistry deployment via an XState machine.
 *
 * The actor is created lazily when deploySubregistry is called,
 * not on component mount. This ensures the machine only runs
 * when the user initiates a deployment.
 *
 * If customSubregistryAddress is provided, skips the deploy step and
 * directly calls setSubregistry to link the custom address.
 */
export function useSubregistryDeployment({
  name,
  factoryAddress,
  implAddress,
  currentNameRegistry,
  protocolVersion,
  customSubregistryAddress,
}: UseSubregistryDeploymentParams) {
  // V2 subregistry deployment only works on Namechain Sepolia
  const chainId = namechainSepolia.id
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  // Actor is created lazily when deployment starts (for full deploy flow)
  const [actor, setActor] = useState<SubregistryDeploymentActor | undefined>(
    undefined,
  )

  // Transaction actor for custom subregistry flow (setSubregistry only)
  type TransactionActor = ActorRefFrom<typeof transactionMachine>
  const [customTxActor, setCustomTxActor] = useState<
    TransactionActor | undefined
  >(undefined)

  // Subscribe to operation state (useSelector handles null actor)
  const operationState = useSelector(actor, selectOperationState)

  // Subscribe to custom transaction actor state (for reactive updates)
  const customTxSnapshot = useSelector(customTxActor, (snapshot) => snapshot)
  const customTxData = selectTransactionData(customTxSnapshot)
  const customSetSubregistryState = deriveTransactionState(customTxData)

  // Derive individual transaction states from machine (for full deploy flow)
  const machineStates = deriveStatesFromOperation(operationState)

  // Use appropriate states based on whether we're in custom mode
  const isCustomMode = !!customSubregistryAddress
  const deployState = isCustomMode
    ? ({ status: 'success' } as TransactionState) // Skip deploy for custom
    : machineStates.deployState
  const setSubregistryState = isCustomMode
    ? customSetSubregistryState
    : machineStates.setSubregistryState

  const deploySubregistry = () => {
    if (!walletClient || !publicClient || !currentNameRegistry) {
      console.error('Cannot deploy: missing wallet, public client, or registry')
      return
    }

    // Don't allow deployment for V1 names
    if (protocolVersion === 'ENSv1') {
      console.error('Cannot deploy subregistry for V1 names')
      return
    }

    const label = name.split('.')[0]
    const signer = createEOASigner(walletClient)

    // Custom subregistry flow: skip deploy, directly call setSubregistry
    if (customSubregistryAddress) {
      const writeParams = setSubregistryWriteParameters(
        walletClient as Parameters<typeof setSubregistryWriteParameters>[0],
        {
          registryAddress: currentNameRegistry,
          label,
          subregistryAddress: customSubregistryAddress,
        },
      )

      const data = encodeFunctionData({
        abi: writeParams.abi,
        functionName: writeParams.functionName,
        args: writeParams.args,
      })

      if (!walletClient.account) {
        console.error('Wallet client has no account')
        return
      }

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request: {
            type: 'eoa',
            from: walletClient.account.address,
            to: writeParams.address as Address,
            data,
            chainId,
            gas: 500000n,
          },
        },
        signer,
        {
          description: `Set custom subregistry for ${name}`,
          publicClient,
          timeout: 120000,
        },
      )

      // Get the transaction actor for reactive state updates
      const txActor = transactionManager.getTransaction(txId)
      if (txActor) {
        setCustomTxActor(txActor as TransactionActor)
      }
      return
    }

    // Full deploy flow: use the XState machine
    const deploymentActor = startSubregistryDeployment({
      name,
      factoryAddress,
      implAddress,
      parentRegistry: currentNameRegistry,
      signer,
      publicClient,
      walletClient,
      chainId,
    })

    setActor(deploymentActor)
  }

  return {
    deploySubregistry,
    deployState,
    setSubregistryState,
    hasWallet: !!walletClient,
  }
}
