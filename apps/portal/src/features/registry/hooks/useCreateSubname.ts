/**
 * React hook wrapper for createSubname.
 *
 * Provides a mutation with loading/error states for the UI.
 */

import { useMutation } from '@tanstack/react-query'
import { sepolia } from 'viem/chains'
import { useWalletClient } from 'wagmi'
import {
  type CreateSubnameParameters,
  createSubname,
} from '../helpers/createSubname'
import { createEOASigner } from '../utils/signer.helpers'

type UseCreateSubnameParameters = Omit<
  CreateSubnameParameters,
  'walletClient' | 'signer' | 'chainId'
>

export function useCreateSubname() {
  const chainId = sepolia.id
  const { data: walletClient } = useWalletClient({ chainId })

  const mutation = useMutation({
    mutationFn: async (params: UseCreateSubnameParameters) => {
      if (!walletClient) {
        throw new Error('Wallet not connected')
      }

      const signer = createEOASigner(walletClient)

      return createSubname({
        ...params,
        walletClient,
        signer,
        chainId,
      })
    },
  })

  return {
    createSubname: mutation.mutate,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
  }
}
