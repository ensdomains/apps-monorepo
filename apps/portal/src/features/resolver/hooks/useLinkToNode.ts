import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Address, PublicClient, WalletClient } from 'viem'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { linkToNode } from '@/features/resolver/helpers/linkRecords'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import { invalidateResolverOverview } from './useResolverOverview'

interface UseLinkToNodeOptions {
  readonly resolverAddress: Address
  readonly walletClient: WalletClient | undefined
  readonly publicClient: PublicClient | undefined
  readonly chainId: number
  readonly id: string
  readonly onSuccess?: () => void
}

interface LinkToNodeMutationParams {
  readonly sourceName: string
  readonly targetName: string
}

export const useLinkToNode = ({
  resolverAddress,
  walletClient,
  publicClient,
  chainId,
  id,
  onSuccess,
}: UseLinkToNodeOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ sourceName, targetName }: LinkToNodeMutationParams) => {
      if (!walletClient || !publicClient) {
        throw new Error('Wallet not connected')
      }
      return linkToNode({
        sourceName,
        targetName,
        resolverAddress,
        walletClient,
        publicClient,
        signer: createEOASigner(walletClient),
        chainId,
        id,
      })
    },
    onSuccess: async () => {
      await pollForIndexerSync({
        invalidateQueries: () =>
          invalidateResolverOverview(queryClient, resolverAddress),
      })
      onSuccess?.()
    },
  })
}
