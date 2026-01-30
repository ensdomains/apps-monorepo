/**
 * Hook for saving ENS record changes using the PUBLIC resolver.
 *
 * Note: This uses ensjs setRecordsWriteParameters directly because:
 * - The portal app uses the standard PUBLIC resolver
 * - The recordsMachine is designed for the DEDICATED resolver (smart accounts)
 * - Public resolver: setText(node, key, value)
 * - Dedicated resolver: setText(key, value) + multicallWithNodeCheck(node, calls)
 */

import { transactionManager } from '@ens-apps/transaction-manager'
import { setRecordsWriteParameters } from '@ensdomains/ensjs/wallet'
import { useCallback, useState, useSyncExternalStore } from 'react'
import { match } from 'ts-pattern'
import type { Address, Hash } from 'viem'
import { encodeFunctionData } from 'viem'
import { sepolia } from 'viem/chains'
import { usePublicClient, useWalletClient } from 'wagmi'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import { transformPendingChangesToSetRecords } from '@/features/records/helpers/transformPendingChanges'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import type { EditableRecord } from '@/utils/records/editRecordUtils'

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

export type SaveRecordsStatus =
  | 'idle'
  | 'preparing'
  | 'submitting'
  | 'pending'
  | 'success'
  | 'error'

// ============================================================================
// Hook
// ============================================================================

export function useSaveRecords() {
  // Both V1 (Sepolia) and V2 (Namechain) contracts are on Sepolia for now
  const chainId = sepolia.id

  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const [txId, setTxId] = useState<string | undefined>(undefined)
  const [status, setStatus] = useState<SaveRecordsStatus>('idle')
  const [error, setError] = useState<Error | null>(null)

  // Subscribe to transaction state changes
  const txState = useSyncExternalStore(
    useCallback(
      (callback) => {
        if (!txId) return () => {}
        // Poll for transaction state changes
        const interval = setInterval(() => {
          callback()
        }, 1000)
        return () => clearInterval(interval)
      },
      [txId],
    ),
    useCallback(() => {
      if (!txId) return null
      const actor = transactionManager.getTransaction(txId)
      if (!actor) return null
      return actor.getSnapshot()
    }, [txId]),
  )

  // Derive state from transaction
  const txHash = txState?.context.hash as Hash | undefined
  const isSubmitting = txState?.matches('submitting') ?? false
  const isPending =
    txState?.matches('pending') ?? txState?.matches('confirming') ?? false
  const isSuccess = txState?.matches('success') ?? false
  const isTxError = txState?.matches('error') ?? false

  // Derive combined status using ts-pattern for clarity
  const derivedStatus = match({
    status,
    isSubmitting,
    isPending,
    isSuccess,
    isTxError,
  })
    .with({ status: 'preparing' }, () => 'preparing' as const)
    .with({ status: 'error' }, () => 'error' as const)
    .with({ isSubmitting: true }, () => 'submitting' as const)
    .with({ isPending: true }, () => 'pending' as const)
    .with({ isSuccess: true }, () => 'success' as const)
    .with({ isTxError: true }, () => 'error' as const)
    .otherwise(() => 'idle' as const) satisfies SaveRecordsStatus

  const saveRecords = async ({
    name,
    resolverAddress,
    originalRecords,
    pendingChanges,
  }: SaveRecordsParams) => {
    // Reset state
    setTxId(undefined)
    setError(null)
    setStatus('preparing')

    if (!walletClient || !publicClient) {
      setError(new Error('Wallet not connected'))
      setStatus('error')
      return { error: 'Wallet not connected' }
    }

    const accountAddress = walletClient.account?.address
    if (!accountAddress) {
      setError(new Error('No account address'))
      setStatus('error')
      return { error: 'No account address' }
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
        setError(new Error('No record changes to save'))
        setStatus('error')
        return { error: 'No record changes to save' }
      }

      console.log('📝 Building setRecords transaction:', {
        name,
        resolverAddress,
        chainId,
        accountAddress,
        texts: recordsInput.texts,
        coins: recordsInput.coins,
        hasContentHash: recordsInput.contentHash !== undefined,
      })

      // Build the write parameters using ensjs (handles public resolver multicall)
      const writeParams = await setRecordsWriteParameters(walletClient, {
        name,
        resolverAddress,
        ...recordsInput,
      })

      console.log('📝 Write params:', {
        address: writeParams.address,
        functionName: writeParams.functionName,
        argsLength: writeParams.args?.length,
      })

      // Encode the transaction data
      const data = encodeFunctionData({
        abi: writeParams.abi,
        functionName: writeParams.functionName,
        args: writeParams.args,
      })

      // Create the signer
      const signer = createEOASigner(walletClient)

      console.log('🚀 Starting transaction via transaction manager')

      // Let transaction manager handle gas estimation
      // Manual estimation removed - was failing due to resolver authorization checks
      const newTxId = transactionManager.startTransaction(
        {
          type: 'custom',
          request: {
            type: 'eoa',
            from: accountAddress,
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

      console.log('✅ Transaction started:', newTxId)

      setTxId(newTxId)
      setStatus('idle') // Let transaction state take over
      return {}
    } catch (err) {
      console.error('❌ Failed to prepare transaction:', err)
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      setStatus('error')
      return { error: error.message }
    }
  }

  const reset = () => {
    setTxId(undefined)
    setError(null)
    setStatus('idle')
  }

  return {
    saveRecords,
    txHash,
    status: derivedStatus,
    isWriting: derivedStatus === 'submitting',
    isConfirming: derivedStatus === 'pending',
    isSuccess: derivedStatus === 'success',
    isError: derivedStatus === 'error',
    error: error ?? (isTxError ? (txState?.context.error as Error) : null),
    reset,
    hasWallet: !!walletClient,
  }
}
