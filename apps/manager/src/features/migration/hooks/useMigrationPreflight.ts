import { useQueryClient } from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
import { usePublicClient } from 'wagmi'
import {
  computeMigrationPreflight,
  EMPTY_PREFLIGHT,
  type MigrationPreflight,
} from '@/features/migration/service/computeMigrationPreflight'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'

type HookParams = {
  eoa: Address | undefined
}

export const useMigrationPreflight = ({ eoa }: HookParams) => {
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()

  const ensure = (
    domains: readonly V1Domain[],
  ): Promise<MigrationPreflight> => {
    if (!eoa || !publicClient) {
      return Promise.resolve(EMPTY_PREFLIGHT)
    }
    const ids = [...domains]
      .map((d) => d.id)
      .sort()
      .join(',')
    return queryClient.ensureQueryData({
      queryKey: ['migration-preflight', eoa.toLowerCase(), ids] as const,
      queryFn: () =>
        computeMigrationPreflight({
          eoa,
          domains,
          publicClient: publicClient as unknown as PublicClient,
        }),
      staleTime: 60_000,
    })
  }

  return { ensure }
}
