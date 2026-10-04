import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { RecordList } from '@/features/records/components/RecordList'
import { useCanEditRecords } from '@/features/records/hooks/useCanEditRecords'
import { queryClient } from '@/utils/queryClient'

/** Copy per bigname `unresolvable_reason`; an unknown reason gets the generic line. */
const UNRESOLVABLE_DESCRIPTIONS: Partial<Record<string, string>> = {
  no_live_ens_v2_entry:
    'Resolution now starts in ENSv2, and this name has no live ENSv2 entry, so it resolves to nothing. It keeps its owner and registration.',
}

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

  const profileQuery = useQuery({
    ...getProfileQueryOptions({ name }),
    // Always refetch on mount to ensure fresh data after edits
    refetchOnMount: 'always' as const,
  })
  const { canEdit, isLoading: isCanEditLoading } = useCanEditRecords({ name })

  const isLoading = profileQuery.isLoading || isCanEditLoading

  if (isLoading) return <LoadingMessage />

  if (profileQuery.error) {
    return (
      <ErrorMessage
        compact
        description="Error fetching records. Please refresh the page."
      />
    )
  }

  if (profileQuery.data?.unresolvableReason) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeading parent={{ type: 'name', name }}>Records</PageHeading>
        <NoResultsMessage
          title="This name does not resolve"
          description={
            UNRESOLVABLE_DESCRIPTIONS[profileQuery.data.unresolvableReason] ??
            'This name resolves to nothing, so it has no records to show.'
          }
          className="mx-0"
        />
      </div>
    )
  }

  if (!profileQuery.data) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeading parent={{ type: 'name', name }}>Records</PageHeading>
        <NoResultsMessage
          title="No records yet"
          description="This name doesn't have any records set. Records will appear here once they're configured."
          className="mx-0"
        />
      </div>
    )
  }

  return (
    <RecordList
      name={name}
      records={profileQuery.data.records}
      canEdit={canEdit}
    />
  )
}
