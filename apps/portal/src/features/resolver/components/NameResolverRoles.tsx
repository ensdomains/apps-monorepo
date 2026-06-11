import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { useNameResolverAddress } from '@/features/records/hooks/useNameResolverAddress'
import { ResolverRolesTable } from '@/features/resolver/components/ResolverRolesTable'
import { getResolverOverviewQueryOptions } from '@/features/resolver/hooks/useResolverOverview'

/**
 * Read-only resolver roles for a name's resolver, for embedding on a name page.
 * Management happens on the resolver page itself, so the slider is disabled here.
 */
export const NameResolverRolesOverviewTable = ({ name }: { name: string }) => {
  const { data: resolverAddress } = useNameResolverAddress({ name })

  const { data: overview } = useQuery({
    ...getResolverOverviewQueryOptions({ address: resolverAddress as Address }),
    enabled: Boolean(resolverAddress),
  })

  const roles = overview?.roles ?? []
  if (!resolverAddress || roles.length === 0) return null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-sm font-medium leading-none uppercase">
        {name} resolver roles
      </h1>
      <ResolverRolesTable
        roles={roles}
        nodes={overview?.nodes ?? []}
        resolverAddress={resolverAddress}
        canManageRoles={false}
        disableEdit
      />
    </div>
  )
}
