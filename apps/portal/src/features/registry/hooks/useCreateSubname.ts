/**
 * React hook wrapper for createSubname.
 *
 * Provides a mutation with loading/error states for the UI.
 * Invalidates subnames query on success with indexer sync polling.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useWalletClient } from 'wagmi'
import { isTimeTravelEnabled } from '@/dev/timeTravel'
import { getSubnamesQueryOptions } from '@/features/profile/hooks/useSubnames'
import { sepoliaWithEns } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
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
  const chainId = sepoliaWithEns.id
  const queryClient = useQueryClient()
  const { data: walletClient } = useWalletClient()

  const mutation = useMutation({
    mutationFn: async (params: UseCreateSubnameParameters) => {
      if (!walletClient) {
        throw new Error('Wallet not connected')
      }

      const signer = createEOASigner(walletClient)
      // When time-travel is active, Anvil's block time can be far ahead of
      // Date.now() even with the chain clock applied. Use a 100-year window so
      // the expiry is never already stale on-chain.
      const expires = isTimeTravelEnabled()
        ? BigInt(Math.floor(Date.now() / 1000)) + 3153600000n
        : undefined

      return createSubname({
        ...params,
        walletClient,
        signer,
        chainId,
        expires,
      })
    },
    onSuccess: (_data, variables) => {
      const subnamesQueryKey = getSubnamesQueryOptions({
        name: variables.parentName,
        protocolVersion: variables.protocolVersion,
      }).queryKey

      queryClient.invalidateQueries({
        queryKey: subnamesQueryKey,
        refetchType: 'all',
      })

      pollForIndexerSync({
        invalidateQueries: () =>
          queryClient.invalidateQueries({
            queryKey: subnamesQueryKey,
            refetchType: 'all',
          }),
      })
    },
  })

  return {
    createSubname: mutation.mutate,
    isPending: mutation.isPending,
    isError: mutation.isError,
    isSuccess: mutation.isSuccess,
    error: mutation.error,
    reset: mutation.reset,
  }
}
