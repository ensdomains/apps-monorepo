import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ErrorMessage } from '@/components/molecules/ErrorMessage'
import { LoadingMessage } from '@/components/molecules/LoadingMessage'
import { NotFoundMessage } from '@/components/molecules/NotFoundMessage'
import { NameSubgraphHistory } from '@/components/organisms/NameSubgraphHistory/NameSubgraphHistory'
import { Owner } from '@/components/primary-name/Owner'
import { ExpiryWithRegistrationData } from '@/features/ownership/components/ExpiryWithRegistrationData'
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
        <h1 className="font-medium text-[28px]">Ownership</h1>
      </div>
      <div className="flex flex-col gap-4 sm:gap-6">
        <ExpiryWithRegistrationData name={name} network={data.network} />
        <Owner owner={data.owner} label="Name owner" />
        <NameSubgraphHistory name={name} category="domain" />
      </div>
    </div>
  )
}
