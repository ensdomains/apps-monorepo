import { getSubnameMigrationImpact } from '@ens-apps/migration'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import type { PublicClient } from 'viem'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'

/** What an upgrade of this name alone would leave behind; Manager decides the final tree. */
export const getSubnameImpactPreviewQueryOptions = ({
  name,
  publicClient,
}: {
  readonly name: string
  readonly publicClient: PublicClient | undefined
}) =>
  resultQueryOptions({
    queryKey: qk('migration', 'subname_impact_preview', {
      name,
      chainId: envConfig.chain.id,
    }),
    queryFn: publicClient
      ? ({ signal }) =>
          getSubnameMigrationImpact({
            indexer: bigname,
            publicClient,
            migratingNames: [name],
            signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
          })
      : skipToken,
    enabled: !!publicClient,
    staleTime: 60_000,
    retry: false,
  })
