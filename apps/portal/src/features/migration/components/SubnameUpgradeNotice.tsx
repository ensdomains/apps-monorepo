import { getSubnameMigrationImpact } from '@ens-apps/migration'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken, useQuery } from '@tanstack/react-query'
import { CircleAlert } from 'lucide-react'
import { match } from 'ts-pattern'
import type { PublicClient } from 'viem'
import { usePublicClient } from 'wagmi'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'

export const getSubnameMigrationImpactPreviewQueryOptions = ({
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

/** Explorer links to Manager; only Manager knows the final selected copy tree. */
export const SubnameUpgradeNotice = ({ name }: { readonly name: string }) => {
  const publicClient = usePublicClient({ chainId: envConfig.chain.id })
  const query = useQuery(
    getSubnameMigrationImpactPreviewQueryOptions({ name, publicClient }),
  )
  if (query.isPending || query.isFetching) {
    return (
      <p className="max-w-sm text-muted-foreground text-xs" role="status">
        Checking the impact on existing subnames...
      </p>
    )
  }
  if (!query.isError && query.data?.affectedCount === 0) return null
  return (
    <p
      className="flex max-w-sm items-start gap-2 text-amber-800 text-xs leading-normal dark:text-amber-300"
      role="status"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>
        {match({
          isError: query.isError,
          affectedCount: query.data?.affectedCount,
        })
          .with(
            { isError: true },
            () =>
              'Subname impact could not be checked here. Review it in Manager before upgrading.',
          )
          .otherwise(({ affectedCount }) => {
            const subnameLabel = affectedCount === 1 ? 'subname' : 'subnames'
            return `Upgrading this name on its own would delete ${affectedCount} ${subnameLabel}. Review which subnames will be carried over in Manager before continuing.`
          })}
      </span>
    </p>
  )
}
