import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { Button } from '@/components/ui/button'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { ResolverAddUserSheet } from '@/features/resolver/components/ResolverAddUserSheet'
import { ResolverRolesTable } from '@/features/resolver/components/ResolverRolesTable'
import { getResolverOverviewQueryOptions } from '@/features/resolver/hooks/useResolverOverview'
import { RoleContractGate } from '@/features/roles/components/RoleContractGate'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/resolver/$address/roles/')({
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

  // Only an allowlisted PermissionedResolver gets the resolver role schema: a
  // registry shares EnhancedAccessControl, so these bits would mean something
  // else there.
  return (
    <RoleContractGate
      address={address as Address}
      expected="permissioned-resolver"
    >
      <ResolverRoles address={address as Address} />
    </RoleContractGate>
  )
}

const ResolverRoles = ({ address }: { readonly address: Address }) => {
  const { address: accountAddress } = useConnection()
  const [addUserOpen, setAddUserOpen] = useState(false)

  const {
    data: resolver,
    isLoading,
    error,
  } = useQuery(getResolverOverviewQueryOptions({ address }))

  const { data: hasRootRole } = useQuery({
    ...getHasRolesQueryOptions({
      resolverAddress: address,
      roles: ['ROLE_SET_ADDRESS'],
      account: accountAddress as Address,
    }),
    enabled: !!accountAddress,
  })

  const canManageRoles = Boolean(hasRootRole)

  if (isLoading) return <LoadingMessage />
  if (error)
    return (
      <ErrorMessage
        compact
        description="Error fetching roles. Please refresh the page."
      />
    )

  const roles = resolver?.roles ?? []

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <PageHeading parent={{ type: 'resolver', address }}>Roles</PageHeading>
        {accountAddress && canManageRoles && (
          <Button
            variant="default"
            className="flex items-center gap-2"
            onClick={() => setAddUserOpen(true)}
          >
            <Plus className="size-4" />
            Add user
          </Button>
        )}
      </div>
      {roles.length === 0 ? (
        <NoResultsMessage
          title="No role holders yet"
          description="Accounts with roles on this resolver will appear here."
          className="mx-0"
        />
      ) : (
        <ResolverRolesTable
          roles={roles}
          namedResources={resolver?.namedResources ?? []}
          resolverAddress={address}
          canManageRoles={canManageRoles}
        />
      )}
      <ResolverAddUserSheet
        open={addUserOpen}
        onOpenChange={setAddUserOpen}
        resolverAddress={address}
      />
    </div>
  )
}
