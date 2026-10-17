import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions } from '@tanstack/react-query'
import { type Address, erc20Abi } from 'viem'
import { l2Sources } from '@/config'
import { l2PublicClients } from '@/lib/wagmi'

/** The owner's USDC on each L2 source by chain id; `null` where a read failed. */
export const getL2BalancesQueryOptions = (owner: Address | undefined) =>
  queryOptions({
    queryKey: $qk({ $scope: 'wallet', $action: 'l2-usdc-balances', owner }),
    queryFn: async (): Promise<Record<number, bigint | null>> => {
      if (!owner) return {}
      const entries = await Promise.all(
        l2Sources.map(async ({ chain, usdc }) => {
          const balance = await l2PublicClients
            .get(chain.id)
            ?.readContract({
              address: usdc,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [owner],
            })
            .catch(() => null)
          return [chain.id, balance ?? null] as const
        }),
      )
      return Object.fromEntries(entries)
    },
    enabled: !!owner && l2Sources.length > 0,
    refetchInterval: 30_000,
  })
