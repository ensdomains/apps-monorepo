import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { Address } from 'viem'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { getResolverOverviewQueryOptions } from '@/features/resolver/hooks/useResolverOverview'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
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

      {roles.length === 0 ? (
        <p className="text-muted-foreground">No role holders found.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {roles.map((role) => (
            <div
              key={`${role.account}-${role.roleBitmap}`}
              className="flex flex-col gap-2 p-4 border border-border rounded-lg"
            >
              <div className="flex flex-row items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">Account</span>
                <span className="font-mono text-sm">
                  {truncateAddress(role.account, 6, 4, '...')}
                </span>
              </div>
              <div className="flex flex-row items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">
                  Role Bitmap
                </span>
                <span className="font-mono text-sm">{role.roleBitmap}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
