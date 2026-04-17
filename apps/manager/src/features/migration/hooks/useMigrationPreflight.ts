import { useQueryClient } from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
import { useConfig, usePublicClient } from 'wagmi'
import {
  computeMigrationPreflight,
  EMPTY_PREFLIGHT,
  type MigrationPreflight,
} from '@/features/migration/service/computeMigrationPreflight'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'
import { customSepolia } from '@/lib/wagmi'

type HookParams = {
  eoa: Address | undefined
  scaAddress: Address | undefined
}

export const useMigrationPreflight = ({ eoa, scaAddress }: HookParams) => {
  const publicClient = usePublicClient({ chainId: customSepolia.id })
  const wagmiConfig = useConfig()
  const queryClient = useQueryClient()

  const ensure = (
    domains: readonly V1Domain[],
  ): Promise<MigrationPreflight> => {
    if (!eoa || !scaAddress || !publicClient) {
      return Promise.resolve(EMPTY_PREFLIGHT)
    }
    const ids = [...domains]
      .map((d) => d.id)
      .sort()
      .join(',')
    return queryClient.ensureQueryData({
      queryKey: [
        'migration-preflight',
        eoa.toLowerCase(),
        scaAddress.toLowerCase(),
        ids,
      ] as const,
      queryFn: () =>
        computeMigrationPreflight({
          eoa,
          scaAddress,
          domains,
          wagmiConfig,
          publicClient: publicClient as unknown as PublicClient,
        }),
      staleTime: 60_000,
    })
  }

  return { ensure }
}
