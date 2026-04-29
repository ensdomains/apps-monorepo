import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { NameSubgraphHistory } from '@/components/table/NameSubgraphHistory/NameSubgraphHistory'
import { ExpiryWithRegistrationData } from '@/features/ownership/components/ExpiryWithRegistrationData'
import { V1NameManagerRecord } from '@/features/ownership/components/V1NameManagerRecord'
import { Owner } from '@/features/profile/components/Owner'
import { ParentName } from '@/features/profile/components/ParentName'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'

export const Route = createFileRoute('/$name/ownership')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { name } = Route.useParams()

  const { data, isLoading, error } = useQuery(getEnsOwnerQueryOptions({ name }))

  if (error)
    return (
      <ErrorMessage
        title="Failed to fetch owner"
        description={error.cause.message}
      />
    )

  if (isLoading) return <LoadingMessage title="Loading owner data" />

  if (!data) return null

  return (
    <div className="max-w-360 w-full mx-auto flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      <div className="flex flex-row justify-between">
        <h1 className="font-medium text-heading">Ownership</h1>
      </div>
      <div className="flex flex-col gap-4 sm:gap-6">
        <ExpiryWithRegistrationData
          name={name}
          protocolVersion={data.protocolVersion}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <Owner owner={data.owner} label="Name owner" />
          <ParentName name={name} />
        </div>
        {data.protocolVersion === 'ENSv1' && (
          <V1NameManagerRecord name={name} className="w-full" />
        )}
        <NameSubgraphHistory name={name} category="domain" />
      </div>
    </div>
  )
}
