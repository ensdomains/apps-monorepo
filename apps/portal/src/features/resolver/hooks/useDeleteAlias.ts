import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Address, PublicClient, WalletClient } from 'viem'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { deleteAlias } from '@/features/resolver/helpers/setAlias'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'

interface UseDeleteAliasOptions {
  readonly resolverAddress: Address
  readonly walletClient: WalletClient | undefined
  readonly publicClient: PublicClient | undefined
  readonly chainId: number
}

export const useDeleteAlias = ({
  resolverAddress,
  walletClient,
  publicClient,
  chainId,
}: UseDeleteAliasOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (fromName: string) => {
      if (!walletClient || !publicClient) {
        throw new Error('Wallet not connected')
      }
      return deleteAlias({
        fromName,
        resolverAddress,
        walletClient,
        publicClient,
        signer: createEOASigner(walletClient),
        chainId,
      })
    },
    onSuccess: async () => {
      await pollForIndexerSync({
        invalidateQueries: () =>
          queryClient.invalidateQueries({
            queryKey: ['resolver-overview'],
            refetchType: 'all',
          }),
      })
    },
  })
}
