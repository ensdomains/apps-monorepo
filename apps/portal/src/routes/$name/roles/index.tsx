import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { chain } from '@/config'
import { getPaletteWorkflowReadiness } from '@/features/command-palette/handoff'
import { usePaletteHandoff } from '@/features/command-palette/usePaletteHandoff'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { NameRegistryRolesOverviewTable } from '@/features/registry/components/v2/NameRegistryRolesOverviewTable'
import { NameResolverRolesOverviewTable } from '@/features/resolver/components/NameResolverRolesOverviewTable'
import { NameRolesOverviewTable } from '@/features/roles/components/NameRolesOverviewTable'

export const Route = createFileRoute('/$name/roles/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { name } = Route.useParams()
  const { address } = useConnection()

  // Owner resolution walks the V2 registry tree at any depth, and non-.eth
  // names resolve as ENSv1, so the protocol check below is the only gate.
  const {
    data: owner,
    isLoading,
    error,
  } = useQuery(getEnsOwnerQueryOptions({ name }))

  usePaletteHandoff({
    kind: 'grant-role',
    name,
    chainId: chain.id,
    account: address,
    readiness:
      owner?.protocolVersion === 'ENSv2' && !error
        ? 'checking'
        : getPaletteWorkflowReadiness({
            isChecking: isLoading,
            canOpen: false,
            blockedReason: 'Role management is only available for ENSv2 names.',
            failureReason: error
              ? `Could not load roles for ${name}. Refresh and try again.`
              : null,
          }),
    onOpen: () => {},
  })

  if (isLoading) return <LoadingMessage />

  if (error)
    return (
      <ErrorMessage
        compact
        description="Error fetching roles. Please refresh the page."
      />
    )

  if (owner?.protocolVersion !== 'ENSv2')
    return (
      <div className="flex flex-col gap-8">
        <PageHeading parent={{ type: 'name', name }}>Roles</PageHeading>
        <NoResultsMessage
          title="Roles unavailable"
          description="Role management is only available for ENSv2 names."
          className="mx-0"
        />
      </div>
    )

  return (
    <div className="flex flex-col gap-8">
      <PageHeading parent={{ type: 'name', name }}>Roles</PageHeading>
      <NameRegistryRolesOverviewTable name={name} />
      <NameResolverRolesOverviewTable name={name} />
      <NameRolesOverviewTable
        name={name}
        registryAddress={owner.registryAddress}
      />
    </div>
  )
}
