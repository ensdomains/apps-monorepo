/**
 * React hook wrapper for saveRecords.
 *
 * Provides a mutation with loading/error states for the UI.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { sepolia } from 'viem/chains'
import { usePublicClient, useWalletClient } from 'wagmi'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import { type SaveRecordsParameters, saveRecords } from '../helpers/saveRecords'

type UseSaveRecordsParameters = Omit<
  SaveRecordsParameters,
  'walletClient' | 'publicClient' | 'signer' | 'chainId'
>

type UseSaveRecordsOptions = {
  /** Called after syncing completes (indexer has caught up) */
  onSyncComplete?: () => void
}

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

  const syncAfterSave = useCallback(
    async (name: string) => {
      setIsSyncing(true)

      try {
        await pollForIndexerSync({
          invalidateQueries: () =>
            queryClient.invalidateQueries({
              queryKey: getProfileQueryOptions(name).queryKey,
              refetchType: 'all',
            }),
        })
      } finally {
        setIsSyncing(false)
        onSyncComplete?.()
      }
    },
    [queryClient, onSyncComplete],
  )

  const mutation = useMutation({
    mutationFn: async (params: UseSaveRecordsParameters) => {
      if (!walletClient || !publicClient) {
        throw new Error('Wallet not connected')
      }

      if (!walletClient.account) {
        throw new Error('No account connected')
      }

      const signer = createEOASigner(walletClient)

      return saveRecords({
        ...params,
        walletClient,
        publicClient,
        signer,
        chainId,
      })
    },
    onSuccess: (_data, variables) => {
      // Start refetching with retry logic (don't await - let it run in background)
      syncAfterSave(variables.name)
    },
  })

  return {
    saveRecords: mutation.mutate,
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
