import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { NameResolverRolesOverviewTable } from '@/features/resolver/components/NameResolverRolesOverviewTable'
import { NameRolesOverviewTable } from '@/features/roles/components/NameRolesOverviewTable'

export const Route = createFileRoute('/$name/roles/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { name } = Route.useParams()
  const labels = name.split('.')

  const { data, isLoading, error } = useQuery({
    ...getEnsOwnerQueryOptions({ name }),
    enabled: name.endsWith('.eth'),
  })

  if (!name.endsWith('.eth') || (labels.length !== 2 && labels.length !== 3))
    return <ErrorMessage title="Only 2LD and 3LD .eth names are supported" />
  if (isLoading) return <LoadingSpinner title="Loading name" />
  if (error)
    return (
      <ErrorMessage
        title={error.cause?.name}
        description={error.cause?.message}
      />
    )
  if (data?.protocolVersion !== 'ENSv2')
    return (
      <ErrorMessage
        title="This is not an ENSv2 name"
        description="Role editing is supported only for ENSv2 names at the moment."
      />
    )

  return (
    <div className="max-w-360 w-full mx-auto flex flex-col gap-12 m-6 px-4 md:px-10">
      <h1 className="text-2xl md:text-heading font-medium leading-none">
        Roles
      </h1>
      <NameResolverRolesOverviewTable name={name} />
      <NameRolesOverviewTable name={name} />
    </div>
  )
}
