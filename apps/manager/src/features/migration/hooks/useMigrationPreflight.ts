import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
import { useConfig, usePublicClient } from 'wagmi'
import {
  computeMigrationPreflight,
  EMPTY_PREFLIGHT,
  type MigrationPreflight,
} from '@/features/migration/service/computeMigrationPreflight'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'
import { customSepolia } from '@/lib/wagmi'

type Params = {
  eoa: Address | undefined
  scaAddress: Address | undefined
  domains: readonly V1Domain[]
}

const buildQueryKey = ({ eoa, scaAddress, domains }: Params) => {
  const ids = [...domains]
    .map((d) => d.id)
    .sort()
    .join(',')
  return [
    'migration-preflight',
    eoa?.toLowerCase(),
    scaAddress?.toLowerCase(),
    ids,
  ] as const
}

export const useMigrationPreflight = (params: Params) => {
  const publicClient = usePublicClient({ chainId: customSepolia.id })
  const wagmiConfig = useConfig()
  const queryClient = useQueryClient()

  const queryKey = buildQueryKey(params)

  const fetch = async (): Promise<MigrationPreflight> => {
    if (!params.eoa || !params.scaAddress || !publicClient)
      return EMPTY_PREFLIGHT
    return computeMigrationPreflight({
      eoa: params.eoa,
      scaAddress: params.scaAddress,
      domains: params.domains,
      wagmiConfig,
      publicClient: publicClient as unknown as PublicClient,
    })
  }

  const query = useQuery({
    queryKey,
    enabled: !!params.eoa && !!params.scaAddress && !!publicClient,
    queryFn: fetch,
    staleTime: 60_000,
  })

  const ensure = (): Promise<MigrationPreflight> =>
    queryClient.ensureQueryData({ queryKey, queryFn: fetch, staleTime: 60_000 })

  return { ...query, ensure }
}
