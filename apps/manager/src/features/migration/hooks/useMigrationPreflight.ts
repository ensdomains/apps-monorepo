import type { V1Domain } from '@ens-apps/migration'
import { useQueryClient } from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
import { useConfig, usePublicClient } from 'wagmi'
import {
  computeMigrationPreflight,
  EMPTY_PREFLIGHT,
  type MigrationPreflight,
} from '@/features/migration/service/computeMigrationPreflight'

type HookParams = {
  eoa: Address | undefined
  hcaAddress?: Address
}

type EnsureOptions = {
  readonly signal?: AbortSignal
  readonly staleTime?: number
  /** Whether any name was opted in to manager restoration. */
  readonly requiresManagerRestoration?: boolean
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
    // Part of the key, but only as a boolean: restoring a manager adds an
    // ETHRegistry operator approval, so a preflight taken without it would plan
    // the wrong approvals — yet *which* names were picked changes nothing here,
    // so ticking a second name reuses this (on-chain) result instead of
    // re-running it.
    const requiresManagerRestoration =
      options.requiresManagerRestoration ?? false
    const preflight = await queryClient.fetchQuery({
      queryKey: [
        'migration-preflight',
        eoa.toLowerCase(),
        hcaAddress?.toLowerCase() ?? '',
        ids,
        requiresManagerRestoration,
      ] as const,
      queryFn: () =>
        computeMigrationPreflight({
          eoa,
          hcaAddress,
          domains,
          requiresManagerRestoration,
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
