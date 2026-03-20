/**
 * React hook for setting reverse resolution (address → name) via transactionManager.
 *
 * Wraps the setReverseResolution helper in a TanStack mutation.
 * Invalidates the reverse resolution query on success so the UI updates.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Hex } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { setReverseResolution } from '../helpers/setReverseResolution'

interface WriteRequest {
  readonly address: `0x${string}`
  readonly abi: readonly unknown[]
  readonly functionName: string
  readonly args: readonly unknown[]
}

interface UseSetReverseResolutionParams {
  readonly chainId: number
  readonly id: string
}

export const useSetReverseResolution = ({
  chainId,
  id,
}: UseSetReverseResolutionParams) => {
  const queryClient = useQueryClient()
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const mutation = useMutation({
    mutationFn: async (params: {
      name: string
      request: WriteRequest
    }): Promise<{ txId: string; hash: Hex }> => {
      if (!walletClient?.account || !publicClient) {
        throw new Error('Wallet not connected')
      }
      const signer = createEOASigner(walletClient)
      return setReverseResolution({
        name: params.name,
        request: params.request,
        walletClient,
        publicClient,
        signer,
        chainId,
        id,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['get-reverse-resolution'] })
    },
  })

  return {
    setReverseResolution: mutation.mutate,
    setReverseResolutionAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
    hasWallet: Boolean(walletClient?.account),
  }
}
