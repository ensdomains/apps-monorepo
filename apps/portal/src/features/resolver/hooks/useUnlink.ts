import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Address, PublicClient, WalletClient } from 'viem'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { unlink } from '@/features/resolver/helpers/linkRecords'
import {
  getResolverOverviewQueryOptions,
  type ResolverOverview,
} from '@/features/resolver/hooks/useResolverOverview'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'

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
          return {
            ...current,
            links: current.links.filter((l) => l.fromName !== sourceName),
            linkCount: Math.max(0, current.linkCount - 1),
          }
        },
      )

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
