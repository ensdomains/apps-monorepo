import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { RecordList } from '@/features/records/components/RecordList'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/$name/records')({
  component: App,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) => {
    return queryClient.prefetchQuery(
      getProfileQueryOptions({ name: params.name }),
    )
  },
})

function App() {
  const { name } = Route.useParams()
  const { address: connectedAddress } = useConnection()

  const ownerQuery = useQuery(getEnsOwnerQueryOptions({ name }))
  const profileQuery = useQuery({
    ...getProfileQueryOptions({
      name,
      protocolVersion: ownerQuery.data?.protocolVersion,
    }),
    // Always refetch on mount to ensure fresh data after edits
    refetchOnMount: 'always' as const,
  })

  const isLoading = profileQuery.isLoading || ownerQuery.isLoading

  if (isLoading) return <LoadingMessage />

  if (profileQuery.error) {
    return (
      <ErrorMessage
        compact
        description="Error fetching records. Please refresh the page."
      />
    )
  }

  if (!profileQuery.data) {
    return (
      <div className="flex flex-col gap-8">
        <h1 className="text-h1">Records</h1>
        <NoResultsMessage
          title="No records yet"
          description="This name doesn't have any records set. Records will appear here once they're configured."
          className="mx-0"
        />
      </div>
    )
  }

  // Check if connected user can edit records
  // Must be connected AND be the owner
  const ownerData = ownerQuery.data
  const canEdit =
    !!connectedAddress &&
    !!ownerData &&
    connectedAddress.toLowerCase() === ownerData.owner.toLowerCase()

  return (
    <RecordList
      name={name}
      records={profileQuery.data.records}
      canEdit={canEdit}
      protocolVersion={ownerData?.protocolVersion}
    />
  )
}
