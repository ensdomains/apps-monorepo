/**
 * React hook wrapper for saveRecords.
 *
 * Provides a mutation with loading/error states for the UI.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sepolia } from 'viem/chains'
import { usePublicClient, useWalletClient } from 'wagmi'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { type SaveRecordsParams, saveRecords } from '../helpers/saveRecords'

type UseSaveRecordsParams = Omit<
  SaveRecordsParams,
  'publicClient' | 'accountAddress' | 'signer' | 'chainId'
>

/**
 * Hook that provides a mutation for saving ENS records.
 *
 * Uses TanStack Query's useMutation for proper loading/error states.
 * Automatically invalidates the profile query on success.
 */
export function useSaveRecords() {
  const chainId = sepolia.id
  const queryClient = useQueryClient()
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

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
      // Invalidate the profile query to refetch records
      queryClient.invalidateQueries({
        queryKey: getProfileQueryOptions(variables.name).queryKey,
      })
    },
  })

  return {
    saveRecords: mutation.mutateAsync,
    isWriting: mutation.isPending,
    isConfirming: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    txHash: mutation.data?.hash,
    reset: mutation.reset,
    hasWallet: !!walletClient,
  }
}
