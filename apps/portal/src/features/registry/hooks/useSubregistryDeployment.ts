import {
  type transactionMachine,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { useSelector } from '@xstate/react'
import { useCallback, useEffect, useState } from 'react'
import type { Address, WalletClient } from 'viem'
import { zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { useWalletClient } from 'wagmi'
import type { SnapshotFrom } from 'xstate'
import type {
  TransactionState,
  UseSubregistryDeploymentParams,
} from '@/features/registry/types/subregistry.types'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import {
  prepareDeploySubregistryTransaction,
  prepareSetSubregistryTransaction,
} from '@/features/registry/utils/subregistry-deployment.helpers'
import {
  isError,
  isHash,
  isTransactionReceipt,
} from '@/features/registry/utils/type-guards'

const IDLE_STATE: TransactionState = { status: 'idle' }

type TransactionSnapshot = SnapshotFrom<typeof transactionMachine>

/**
 * Selector that extracts transaction state data from actor snapshot.
 * Returns undefined if snapshot is not available.
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
 * Hook that tracks transaction state using useSelector from @xstate/react.
 */
function useTransactionState(txId: string | null): TransactionState {
  const actor = txId ? transactionManager.getTransaction(txId) : undefined
  const data = useSelector(actor, selectTransactionData)
  return deriveTransactionState(data)
}

interface UseAutoTriggerSetSubregistryParams {
  readonly deployState: TransactionState
  readonly walletClient: WalletClient | undefined
  readonly currentNameRegistry: Address | null
  readonly protocolVersion: 'ENSv1' | 'ENSv2' | null
  readonly label: string
  readonly name: string
}

/**
 * Hook that automatically triggers setSubregistry transaction after deploy succeeds.
 * Handles the two-step flow: deploy contract → set subregistry.
 */
function useAutoTriggerSetSubregistry({
  deployState,
  walletClient,
  currentNameRegistry,
  protocolVersion,
  label,
  name,
}: UseAutoTriggerSetSubregistryParams) {
  const [txId, setTxId] = useState<string | null>(null)
  const [hasTriggered, setHasTriggered] = useState(false)

  useEffect(() => {
    if (
      deployState.status !== 'success' ||
      !walletClient ||
      !currentNameRegistry ||
      hasTriggered
    ) {
      return
    }

    const deployedAddress =
      deployState.receipt.contractAddress ||
      deployState.receipt.logs[0]?.address

    if (
      !deployedAddress ||
      protocolVersion === 'ENSv1' ||
      currentNameRegistry === zeroAddress
    ) {
      return
    }

    // Capture narrowed values for use in async callback
    const client = walletClient
    const registry = currentNameRegistry

    setHasTriggered(true)

    prepareSetSubregistryTransaction({
      registryAddress: registry,
      label,
      subregistryAddress: deployedAddress,
      walletClient: client,
      chainId: sepolia.id,
    }).then((result) => {
      if (result.isErr()) {
        console.error(
          'Failed to prepare setSubregistry transaction:',
          result.error,
        )
        return
      }

      const signer = createEOASigner(client)
      const newTxId = transactionManager.startTransaction(
        result.value,
        signer,
        {
          chainId: sepolia.id,
          description: `Set subregistry for ${name}`,
          timeout: 120000,
        },
      )

      setTxId(newTxId)
    })
  }, [
    deployState,
    walletClient,
    currentNameRegistry,
    label,
    protocolVersion,
    name,
    hasTriggered,
  ])

  const reset = useCallback(() => {
    setHasTriggered(false)
    setTxId(null)
  }, [])

  return { txId, reset }
}

export function useSubregistryDeployment({
  name,
  factoryAddress,
  implAddress,
  currentNameRegistry,
  protocolVersion,
}: UseSubregistryDeploymentParams) {
  const { data: walletClient } = useWalletClient({ chainId: sepolia.id })

  const [deployTxId, setDeployTxId] = useState<string | null>(null)
  const deployState = useTransactionState(deployTxId)

  const label = name.split('.')[0]

  const { txId: setSubregistryTxId, reset: resetSetSubregistry } =
    useAutoTriggerSetSubregistry({
      deployState,
      walletClient,
      currentNameRegistry,
      protocolVersion,
      label,
      name,
    })

  const setSubregistryState = useTransactionState(setSubregistryTxId)

  const deploySubregistry = useCallback(async () => {
    if (!walletClient) {
      return
    }

    const result = await prepareDeploySubregistryTransaction({
      factoryAddress,
      implAddress,
      walletClient,
      chainId: sepolia.id,
    })

    if (result.isErr()) {
      console.error('Failed to prepare deploy transaction:', result.error)
      return
    }

    const signer = createEOASigner(walletClient)
    const txId = transactionManager.startTransaction(result.value, signer, {
      chainId: sepolia.id,
      description: `Deploy subregistry for ${name}`,
      timeout: 120000,
    })

    setDeployTxId(txId)
    resetSetSubregistry()
  }, [walletClient, factoryAddress, implAddress, name, resetSetSubregistry])

  return {
    deploySubregistry,
    deployState,
    setSubregistryState,
    hasWallet: !!walletClient,
  }
}
