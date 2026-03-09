import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { Address } from 'viem'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { ResolverRolesTable } from '@/features/resolver/components/ResolverRolesTable'
import { getResolverOverviewQueryOptions } from '@/features/resolver/hooks/useResolverOverview'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/resolver/$address/roles')({
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

  const { data: resolver } = useQuery(
    getResolverOverviewQueryOptions({ address: address as Address }),
  )

  const roles = resolver?.roles ?? []

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 w-full max-w-360 mx-auto">
      <h1 className="text-2xl md:text-heading font-medium leading-none">
        Roles
      </h1>
      <ResolverRolesTable roles={roles} />
    </div>
  )
}
