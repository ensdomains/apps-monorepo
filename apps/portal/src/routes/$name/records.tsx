import { useQueries } from '@tanstack/react-query'
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
  staticData: { hasSidebar: true },
  loader: ({ params }) => {
    return queryClient.prefetchQuery(getProfileQueryOptions(params.name))
  },
})

function App() {
  const { name } = Route.useParams()
  const { address: connectedAddress } = useConnection()

  const [profileQuery, ownerQuery] = useQueries({
    queries: [
      {
        ...getProfileQueryOptions(name),
        // Always refetch on mount to ensure fresh data after edits
        refetchOnMount: 'always' as const,
      },
      getEnsOwnerQueryOptions({ name }),
    ],
  })

  const isLoading = profileQuery.isLoading || ownerQuery.isLoading

  if (isLoading) return <LoadingMessage />

  if (profileQuery.error) {
    return (
      <ErrorMessage
        title="Records unavailable"
        description={profileQuery.error.cause.message}
      />
    )
  }

  if (!profileQuery.data) {
    return (
      <NoResultsMessage
        title="No records yet"
        description="This name doesn't have any records set. Records will appear here once they're configured."
      />
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
      network={ownerData?.network}
    />
  )
}
