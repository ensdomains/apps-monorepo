/**
 * Hook for saving ENS record changes.
 *
 * Uses the recordsMachine from transaction-manager for consistent handling.
 * Follows the same pattern as the manager app's ProfileEdit.
 */

import {
  recordsMachine,
  type ServiceRecordSnapshot,
} from '@ens-apps/transaction-manager'
import { useActorRef, useSelector } from '@xstate/react'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { usePublicClient, useWalletClient } from 'wagmi'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { namechainSepolia } from '@/lib/wagmi'
import type { EditableRecord } from '@/utils/records/editRecordUtils'
import { getRecordId } from '@/utils/records/editRecordUtils'
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

// ============================================================================
// Helpers
// ============================================================================

/**
 * Transforms our NameRecord[] to ServiceRecordSnapshot format
 * expected by the recordsMachine.
 */
function toServiceSnapshot(records: NameRecord[]): ServiceRecordSnapshot {
  const texts: Array<{ key: string; value: string }> = []
  const coins: Array<{ coinType: number; value: string }> = []

  for (const record of records) {
    if (record.type === 'text') {
      texts.push({ key: record.key, value: record.value })
    } else if (record.type === 'address') {
      coins.push({ coinType: record.id, value: record.value })
    }
    // Note: contentHash and ABI are not part of ServiceRecordSnapshot
  }

  return { texts, coins }
}

/**
 * Computes the "after" snapshot by applying pending changes to original records.
 */
function computeAfterSnapshot(
  originalRecords: NameRecord[],
  pendingChanges: PendingChanges,
): ServiceRecordSnapshot {
  const { newRecords, editedValues, deletedIds } = pendingChanges

  const texts: Array<{ key: string; value: string }> = []
  const coins: Array<{ coinType: number; value: string }> = []

  // Process original records (apply edits, skip deletions)
  for (const record of originalRecords) {
    const id = getRecordId(record)

    // Skip deleted records
    if (deletedIds.has(id)) continue

    // Apply edits or use original value
    const value = editedValues.get(id) ?? record.value

    if (record.type === 'text') {
      texts.push({ key: record.key, value })
    } else if (record.type === 'address') {
      coins.push({ coinType: record.id, value })
    }
  }

  // Add new records
  for (const record of newRecords) {
    if (record.type === 'text') {
      texts.push({ key: record.key, value: record.value })
    } else if (record.type === 'address') {
      coins.push({ coinType: record.id, value: record.value })
    }
  }

  return { texts, coins }
}

// ============================================================================
// Hook
// ============================================================================

export function useSaveRecords(network: EnsNetworkName = 'sepolia') {
  const chainId =
    network === 'namechainSepolia' ? namechainSepolia.id : sepolia.id

  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  // Create the records machine actor
  const recordsActor = useActorRef(recordsMachine, {
    input: { chainId },
  })

  // Subscribe to machine state
  const { txHash, isSubmitting, isSuccess, isError, errorMessage } =
    useSelector(recordsActor, (state) => {
      const isSubmitting =
        state.matches('submittingUpdate') || state.matches('waitingForUpdate')
      const isSuccess = state.matches('success')
      const isError = state.matches('error')

      return {
        txHash: state.context.txHash,
        isSubmitting,
        isSuccess,
        isError,
        errorMessage: isError
          ? (state.context.error?.message ?? 'Failed to update records')
          : null,
      }
    })

  const saveRecords = ({
    name,
    resolverAddress,
    originalRecords,
    pendingChanges,
  }: SaveRecordsParams) => {
    if (!walletClient || !publicClient) {
      console.error('Cannot save: wallet not connected')
      return { error: 'Wallet not connected' }
    }

    const accountAddress = walletClient.account?.address
    if (!accountAddress) {
      console.error('Cannot save: no account address')
      return { error: 'No account address' }
    }

    // Create signer
    const signer = createEOASigner(walletClient)

    // Transform records to service format
    const before = toServiceSnapshot(originalRecords)
    const after = computeAfterSnapshot(originalRecords, pendingChanges)

    console.log('✅ Creating START_UPDATE event for records:', {
      name,
      resolverAddress,
      accountAddress,
      hasSigner: !!signer,
      hasPublicClient: !!publicClient,
      beforeTexts: before.texts.length,
      afterTexts: after.texts.length,
      beforeCoins: before.coins.length,
      afterCoins: after.coins.length,
    })

    // Send event to the machine
    recordsActor.send({
      type: 'START_UPDATE',
      name,
      before,
      after,
      signer,
      accountAddress,
      publicClient,
      resolverAddress,
    })

    return {}
  }

  const cancel = () => {
    recordsActor.send({ type: 'CANCEL' })
  }

  return {
    saveRecords,
    txHash,
    isWriting: isSubmitting,
    isConfirming: isSubmitting,
    isSuccess,
    isError,
    error: errorMessage ? new Error(errorMessage) : null,
    cancel,
    hasWallet: !!walletClient,
  }
}
