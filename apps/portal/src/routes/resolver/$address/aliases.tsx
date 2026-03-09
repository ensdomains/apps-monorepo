import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { getResolverOverviewQueryOptions } from '@/features/resolver/hooks/useResolverOverview'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/resolver/$address/aliases')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) => {
    return queryClient.prefetchQuery(
      getResolverOverviewQueryOptions({
        address: params.address as Address,
      }),
    )
  },
})

function RouteComponent() {
  const { address } = Route.useParams()

  const {
    data: resolver,
    isLoading,
    error,
  } = useQuery(getResolverOverviewQueryOptions({ address: address as Address }))

  if (isLoading) return <LoadingMessage />
  if (error)
    return (
      <ErrorMessage
        title="Aliases unavailable"
        description={error.cause?.message}
      />
    )

  const aliases = resolver?.aliases ?? []

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 w-full max-w-360 mx-auto">
      <h1 className="text-2xl md:text-heading font-medium leading-none">
        Aliases
      </h1>

      {aliases.length === 0 ? (
        <p className="text-muted-foreground">No aliases configured.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {aliases.map((alias) => (
            <div
              key={`${alias.fromName}-${alias.toName}`}
              className="flex flex-row items-center gap-4 p-4 border border-border rounded-lg"
            >
              <span className="font-mono text-sm break-all flex-1">
                {alias.fromName}
              </span>
              <span className="text-muted-foreground shrink-0">&rarr;</span>
              <span className="font-mono text-sm break-all flex-1 text-right">
                {alias.toName}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
