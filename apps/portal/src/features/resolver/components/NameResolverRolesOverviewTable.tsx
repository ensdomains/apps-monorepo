import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import type { Address } from 'viem'
import { Button } from '@/components/ui/button'
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
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium leading-none uppercase">
          {name} resolver roles
        </h3>
        <Button className="text-muted-foreground" variant="ghost" asChild>
          <Link
            params={{ address: resolverAddress }}
            to="/resolver/$address/roles"
          >
            <ArrowUpRight className="size-5" />
            View
          </Link>
        </Button>
      </div>
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
