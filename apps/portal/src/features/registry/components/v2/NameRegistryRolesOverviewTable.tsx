import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { zeroAddress } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { Button } from '@/components/ui/button'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { RegistryRolesTable } from '@/features/registry/components/v2/RegistryRolesTable'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'

/**
 * Read-only registry roles for a name's own registry, for embedding on the name
 * roles page. Management happens on the registry page itself, so the slider is
 * disabled here and a "View" link points there instead.
 *
 * Registry discovery is only valid for V2 names (see
 * {@link getNameRegistriesQueryOptions}), so it's gated on the owner's protocol
 * version. Renders nothing for V1 names or names without their own registry.
 */
export const NameRegistryRolesOverviewTable = ({ name }: { name: string }) => {
  const { data: owner, isLoading: isLoadingOwner } = useQuery({
    ...getEnsOwnerQueryOptions({ name }),
    enabled: name.endsWith('.eth'),
  })
  const isV2 = owner?.protocolVersion === 'ENSv2'

  const {
    data: registries,
    isLoading: isLoadingRegistries,
    error,
  } = useQuery({
    ...getNameRegistriesQueryOptions({ name }),
    enabled: isV2,
  })

  if (isLoadingOwner) return <LoadingMessage />

  // Only V2 names have their own subregistry, and thus registry roles.
  if (!isV2) return null

  if (isLoadingRegistries) return <LoadingMessage />

  if (error)
    return (
      <ErrorMessage
        title="Registry roles unavailable"
        description={error.cause?.message ?? error.message}
      />
    )

  // Registries are ordered `[name, ...ancestors, root]`, so the name's own
  // registry is at index 0. Absent (or zero) means the name hasn't deployed one.
  const address = registries?.at(0)
  if (!address || address === zeroAddress) return null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium leading-none uppercase">
          {name} registry roles
        </h3>
        <Button className="text-muted-foreground" variant="ghost" asChild>
          <Link params={{ address }} to="/registry/$address/roles">
            <ArrowUpRight className="size-5" />
            View
          </Link>
        </Button>
      </div>
      <RegistryRolesTable address={address} disableEdit />
    </div>
  )
}
