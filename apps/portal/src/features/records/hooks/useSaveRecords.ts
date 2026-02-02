/**
 * React hook wrapper for saveRecords.
 *
 * Provides a mutation with loading/error states for the UI.
 */

import { sleep } from '@ens-apps/utils/sleep'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { sepolia } from 'viem/chains'
import { usePublicClient, useWalletClient } from 'wagmi'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { type SaveRecordsParams, saveRecords } from '../helpers/saveRecords'

type UseSaveRecordsParams = Omit<
  SaveRecordsParams,
  'publicClient' | 'accountAddress' | 'signer' | 'chainId'
>

type UseSaveRecordsOptions = {
  /** Called after syncing completes (indexer has caught up) */
  onSyncComplete?: () => void
}

/** Delay before first refetch attempt (ms) */
const INDEXER_DELAY_MS = 5000
/** Interval between refetch attempts (ms) */
const REFETCH_INTERVAL_MS = 3000
/** Maximum number of refetch attempts */
const MAX_REFETCH_ATTEMPTS = 3

/**
 * Hook that provides a mutation for saving ENS records.
 *
 * Uses TanStack Query's useMutation for proper loading/error states.
 * Automatically invalidates and refetches the profile query on success,
 * with polling to handle indexer lag.
 */
export function useSaveRecords(options: UseSaveRecordsOptions = {}) {
  const { onSyncComplete } = options
  const chainId = sepolia.id
  const queryClient = useQueryClient()
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })
  const [isSyncing, setIsSyncing] = useState(false)

  const refetchWithRetry = useCallback(
    async (name: string) => {
      setIsSyncing(true)

      try {
        // Wait for indexer to catch up
        await sleep(INDEXER_DELAY_MS)

        // Refetch with retries
        for (let attempt = 1; attempt <= MAX_REFETCH_ATTEMPTS; attempt++) {
          // Use refetchType: 'all' to ensure all instances refetch
          await queryClient.invalidateQueries({
            queryKey: getProfileQueryOptions(name).queryKey,
            refetchType: 'all',
          })

          // Wait between retries
          if (attempt < MAX_REFETCH_ATTEMPTS) {
            await sleep(REFETCH_INTERVAL_MS)
          }
        }
      } finally {
        setIsSyncing(false)
        // Call callback after syncing is complete
        onSyncComplete?.()
      }
    },
    [queryClient, onSyncComplete],
  )

  const mutation = useMutation({
    mutationFn: async (params: UseSaveRecordsParams) => {
      if (!walletClient || !publicClient) {
        throw new Error('Wallet not connected')
      }

      const accountAddress = walletClient.account?.address
      if (!accountAddress) {
        throw new Error('No account address')
      }

      const signer = createEOASigner(walletClient)

      return saveRecords({
        ...params,
        publicClient,
        accountAddress,
        signer,
        chainId,
      })
    },
    onSuccess: (_data, variables) => {
      // Start refetching with retry logic (don't await - let it run in background)
      refetchWithRetry(variables.name)
    },
  })

  return {
    saveRecords: mutation.mutateAsync,
    isWriting: mutation.isPending,
    isConfirming: mutation.isPending,
    isSyncing,
    isSuccess: mutation.isSuccess && !isSyncing,
    isError: mutation.isError,
    error: mutation.error,
    txHash: mutation.data?.hash,
    reset: mutation.reset,
    hasWallet: !!walletClient,
  }
}
