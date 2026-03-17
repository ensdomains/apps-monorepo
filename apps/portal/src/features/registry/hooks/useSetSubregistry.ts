/**
 * React hook for setting subregistry on the parent registry.
 *
 * Uses transactionManager.startTransaction. Supports both:
 * - Deploy path: called with deployed address after deploy completes
 * - Custom path: called with custom subregistry address
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Address, Hex } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { setSubregistry } from '@/features/registry/helpers/setSubregistry'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { namechainSepolia } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import type { EnsNetworkName } from '@/utils/types'
import { getNameRegistriesQueryOptions } from './useNameRegistryDiscovery'

interface UseSetSubregistryParams {
  readonly name: string
  readonly network: EnsNetworkName
  readonly label: string
  readonly parentRegistry: Address
  readonly id: string
}

export const useSetSubregistry = ({
  name,
  network,
  label,
  parentRegistry,
  id,
}: UseSetSubregistryParams) => {
  const chainId = namechainSepolia.id
  const queryClient = useQueryClient()
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const mutation = useMutation({
    mutationFn: async (
      subregistryAddress: Address,
    ): Promise<{ txId: string; hash: Hex }> => {
      if (!walletClient?.account || !publicClient) {
        throw new Error('Wallet not connected')
      }
      const signer = createEOASigner(walletClient)
      return setSubregistry({
        name,
        label,
        parentRegistry,
        subregistryAddress,
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
          queryKey: getNameRegistriesQueryOptions({ name, network }).queryKey,
        })
      invalidate()
      pollForIndexerSync({ invalidateQueries: invalidate })
    },
  })

  return {
    setSubregistry: mutation.mutate,
    setSubregistryAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
    hasWallet: Boolean(walletClient?.account),
  }
}
