import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Address, PublicClient, WalletClient } from 'viem'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { unlink } from '@/features/resolver/helpers/linkRecords'
import {
  getResolverOverviewQueryOptions,
  pruneLinksAfterUnlink,
  type ResolverOverview,
} from '@/features/resolver/hooks/useResolverOverview'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import { invalidateResolverOverview } from '../utils/invalidateResolverOverview'

interface UseUnlinkOptions {
  readonly resolverAddress: Address
  readonly walletClient: WalletClient | undefined
  readonly publicClient: PublicClient | undefined
  readonly chainId: number
  readonly id: string
}

export const useUnlink = ({
  resolverAddress,
  walletClient,
  publicClient,
  chainId,
  id,
}: UseUnlinkOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sourceName: string) => {
      if (!walletClient || !publicClient) {
        throw new Error('Wallet not connected')
      }
      return unlink({
        sourceName,
        resolverAddress,
        walletClient,
        publicClient,
        signer: createEOASigner(walletClient),
        chainId,
        id,
      })
    },
    onSuccess: async (_result, sourceName) => {
      const resolverOverviewQueryKey = getResolverOverviewQueryOptions({
        address: resolverAddress,
      }).queryKey

      queryClient.setQueryData<ResolverOverview | null>(
        resolverOverviewQueryKey,
        (current) => {
          if (!current) return current
          const links = pruneLinksAfterUnlink(current.links, sourceName)
          return { ...current, links, linkCount: links.length }
        },
      )

      await pollForIndexerSync({
        invalidateQueries: () => invalidateResolverOverview(queryClient),
      })
    },
  })
}
