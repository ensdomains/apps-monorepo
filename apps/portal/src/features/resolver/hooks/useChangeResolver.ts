/**
 * React hook wrapper for changeResolver.
 *
 * Provides a mutation that changes the resolver via the transaction manager.
 * Invalidates resolver-related queries on success with indexer sync polling.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Address, Hex } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { namechainSepolia } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import { changeResolver } from '../helpers/changeResolver'

const CHANGE_RESOLVER_TX_ID = 'tx-change-resolver'

type UseChangeResolverParams = {
  readonly name: string
  readonly registryAddress: Address
  readonly id?: string
}

/**
 * Hook that provides a mutation for changing the resolver of an ENS name.
 *
 * Uses TransactionModal pattern for single-tx flows: open modal on submit,
 * run changeResolver when user clicks Start. Also supports changeResolverAsync
 * for multi-step flows (e.g. deploy resolver then change).
 */
export const useChangeResolver = ({
  name,
  registryAddress,
  id = CHANGE_RESOLVER_TX_ID,
}: UseChangeResolverParams) => {
  const chainId = namechainSepolia.id
  const queryClient = useQueryClient()
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const mutation = useMutation({
    mutationFn: async (
      resolverAddress: Address,
    ): Promise<{ txId: string; hash: Hex }> => {
      if (!walletClient?.account || !publicClient) {
        throw new Error('Wallet not connected')
      }

      const signer = createEOASigner(walletClient)

      return changeResolver({
        name,
        registryAddress,
        resolverAddress,
        walletClient,
        publicClient,
        signer,
        chainId,
        id,
      })
    },
    onSuccess: () => {
      const invalidate = () =>
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0]
            return (
              key === 'get-resolver-name' ||
              key === 'get-resolver' ||
              key === 'user-dedicated-resolvers'
            )
          },
          refetchType: 'all',
        })
      invalidate()
      pollForIndexerSync({ invalidateQueries: () => invalidate() })
    },
  })

  return {
    changeResolver: mutation.mutate,
    changeResolverAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
    hasWallet: Boolean(walletClient?.account),
  }
}
