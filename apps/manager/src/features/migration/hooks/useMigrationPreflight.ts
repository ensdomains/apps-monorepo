import { useQueryClient } from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
import { useConfig, usePublicClient } from 'wagmi'
import {
  computeMigrationPreflight,
  EMPTY_PREFLIGHT,
  type MigrationPreflight,
} from '@/features/migration/service/computeMigrationPreflight'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'

type HookParams = {
  eoa: Address | undefined
  hcaAddress?: Address
}

type EnsureOptions = {
  readonly signal?: AbortSignal
  readonly staleTime?: number
  /** Names whose ENSv1 registry controller the owner chose to keep as manager. */
  readonly managerRestorationNames?: readonly string[]
}

export const useMigrationPreflight = ({ eoa, hcaAddress }: HookParams) => {
  const publicClient = usePublicClient()
  const wagmiConfig = useConfig()
  const queryClient = useQueryClient()

  const ensure = async (
    domains: readonly V1Domain[],
    options: EnsureOptions = {},
  ): Promise<MigrationPreflight> => {
    options.signal?.throwIfAborted()
    if (!eoa || !publicClient) {
      return EMPTY_PREFLIGHT
    }
    const ids = [...domains]
      .map((d) => d.id)
      .sort()
      .join(',')
    // Part of the key: opting a name in adds a role grant to the batch, so a
    // cached preflight taken without it would plan the wrong approvals.
    const managerRestorationNames = [
      ...(options.managerRestorationNames ?? []),
    ].sort()
    const preflight = await queryClient.fetchQuery({
      queryKey: [
        'migration-preflight',
        eoa.toLowerCase(),
        hcaAddress?.toLowerCase() ?? '',
        ids,
        managerRestorationNames.join(','),
      ] as const,
      queryFn: () =>
        computeMigrationPreflight({
          eoa,
          hcaAddress,
          domains,
          managerRestorationNames,
          wagmiConfig,
          publicClient: publicClient as unknown as PublicClient,
          signal: options.signal,
        }),
      staleTime: options.staleTime ?? 60_000,
    })
    options.signal?.throwIfAborted()
    return preflight
  }

  return { ensure }
}
