/**
 * Hook for saving ENS record changes.
 *
 * Handles the transaction flow for updating records on both v1 (L1) and v2 (L2) networks.
 * Uses the transaction manager pattern for consistent transaction handling.
 */

import {
  type transactionMachine,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { setRecordsWriteParameters } from '@ensdomains/ensjs/wallet'
import { useSelector } from '@xstate/react'
import { useState } from 'react'
import type { Address, Hash, TransactionReceipt } from 'viem'
import { encodeFunctionData } from 'viem'
import { sepolia } from 'viem/chains'
import { usePublicClient, useWalletClient } from 'wagmi'
import type { SnapshotFrom } from 'xstate'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import { transformPendingChangesToSetRecords } from '@/features/records/helpers/transformPendingChanges'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { namechainSepolia } from '@/lib/wagmi'
import type { EditableRecord } from '@/utils/records/editRecordUtils'
import type { EnsNetworkName } from '@/utils/types'

// ============================================================================
// Types
// ============================================================================

type PendingChanges = {
  newRecords: EditableRecord[]
  editedValues: Map<string, string>
  deletedIds: Set<string>
}

export type SaveRecordsParams = {
  name: string
  resolverAddress: Address
  originalRecords: NameRecord[]
  pendingChanges: PendingChanges
}

/**
 * Discriminated union representing the current state of a transaction.
 */
export type TransactionState =
  | { readonly status: 'idle' }
  | { readonly status: 'preparing' }
  | { readonly status: 'submitting' }
  | { readonly status: 'pending'; readonly hash: Hash }
  | {
      readonly status: 'success'
      readonly hash: Hash
      readonly receipt: TransactionReceipt
    }
  | {
      readonly status: 'reverted'
      readonly hash: Hash
      readonly receipt: TransactionReceipt
    }
  | { readonly status: 'error'; readonly error: Error }

const IDLE_STATE: TransactionState = { status: 'idle' }

// ============================================================================
// Helpers
// ============================================================================

type TransactionSnapshot = SnapshotFrom<typeof transactionMachine>

function isHash(value: unknown): value is Hash {
  return typeof value === 'string' && value.startsWith('0x')
}

function isTransactionReceipt(value: unknown): value is TransactionReceipt {
  return (
    typeof value === 'object' &&
    value !== null &&
    'blockHash' in value &&
    'transactionHash' in value
  )
}

function isError(value: unknown): value is Error {
  return value instanceof Error
}

/**
 * Selector that extracts transaction state data from transaction actor snapshot.
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

// ============================================================================
// Hook
// ============================================================================

export function useSaveRecords(network: EnsNetworkName = 'sepolia') {
  const chainId =
    network === 'namechainSepolia' ? namechainSepolia.id : sepolia.id

  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const [txId, setTxId] = useState<string | undefined>(undefined)
  const [prepareState, setPrepareState] = useState<TransactionState>(IDLE_STATE)

  // Get transaction actor if we have a txId
  const txActor = txId ? transactionManager.getTransaction(txId) : undefined

  // Subscribe to transaction state changes
  const txSnapshot = useSelector(txActor, (s) => s)
  const txData = selectTransactionData(txSnapshot)
  const txState = deriveTransactionState(txData)

  // Combined state: preparing state takes precedence, then transaction state
  const state: TransactionState =
    prepareState.status !== 'idle' ? prepareState : txState

  const saveRecords = async ({
    name,
    resolverAddress,
    originalRecords,
    pendingChanges,
  }: SaveRecordsParams) => {
    // Reset state
    setTxId(undefined)
    setPrepareState({ status: 'preparing' })

    if (!walletClient || !publicClient) {
      setPrepareState({
        status: 'error',
        error: new Error('Wallet not connected'),
      })
      return
    }

    try {
      // Transform pending changes to setRecords format
      const recordsInput = transformPendingChangesToSetRecords(
        originalRecords,
        pendingChanges,
      )

      // Check if there are any changes
      if (
        !recordsInput.texts?.length &&
        !recordsInput.coins?.length &&
        recordsInput.contentHash === undefined
      ) {
        setPrepareState({
          status: 'error',
          error: new Error('No record changes to save'),
        })
        return
      }

      // Build the write parameters using ensjs (handles multicall encoding)
      const writeParams = await setRecordsWriteParameters(walletClient, {
        name,
        resolverAddress,
        ...recordsInput,
      })

      // Encode the transaction data for the multicall
      const data = encodeFunctionData({
        abi: writeParams.abi,
        functionName: writeParams.functionName,
        args: writeParams.args,
      })

      // Create the signer
      const signer = createEOASigner(walletClient)
      const fromAddress = walletClient.account?.address

      if (!fromAddress) {
        setPrepareState({
          status: 'error',
          error: new Error('No account address found'),
        })
        return
      }

      // Start the transaction via transaction manager
      const newTxId = transactionManager.startTransaction(
        {
          type: 'custom',
          request: {
            type: 'eoa',
            from: fromAddress,
            to: writeParams.address,
            data,
            value: 0n,
            chainId,
          },
        },
        signer,
        {
          description: `Update records for ${name}`,
          publicClient,
          chainId,
        },
      )

      setTxId(newTxId)
      setPrepareState(IDLE_STATE)
    } catch (error) {
      setPrepareState({
        status: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }

  const reset = () => {
    setTxId(undefined)
    setPrepareState(IDLE_STATE)
  }

  // Derive convenience booleans from state
  const isWriting = state.status === 'submitting'
  const isConfirming = state.status === 'pending'
  const isSuccess = state.status === 'success'
  const isReverted = state.status === 'reverted'
  const error = state.status === 'error' ? state.error : null
  const txHash = 'hash' in state ? state.hash : undefined
  const receipt = 'receipt' in state ? state.receipt : undefined

  return {
    saveRecords,
    state,
    txHash,
    receipt,
    isWriting,
    isConfirming,
    isSuccess,
    isReverted,
    error,
    reset,
    hasWallet: !!walletClient,
  }
}
