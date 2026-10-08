import type { NameDetail } from '@ens-apps/indexer/reads'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameDetailQueryOptions } from '@/features/profile/hooks/useNameDetail'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { RecordList } from '@/features/records/components/RecordList'
import { useCanEditRecords } from '@/features/records/hooks/useCanEditRecords'
import { queryClient } from '@/utils/queryClient'

const UNRESOLVABLE_COPY: Readonly<
  Record<NonNullable<NameDetail['unresolvableReason']>, string>
> = {
  no_live_ens_v2_entry:
    'This ENSv1 name has no ENSv2 entry, so it does not resolve and has no records to show.',
  ens_v2_path_no_resolver:
    'No resolver is set on the path to this name, so it does not resolve and has no records to show.',
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

  const ownerQuery = useQuery(getEnsOwnerQueryOptions({ name }))
  const profileQuery = useQuery({
    ...getProfileQueryOptions({ name }),
    // Always refetch on mount to ensure fresh data after edits
    refetchOnMount: 'always' as const,
  })
  const { canEdit, isLoading: isCanEditLoading } = useCanEditRecords({ name })
  const { data: detail } = useQuery(getNameDetailQueryOptions({ name }))
  const unresolvableReason = detail?.unresolvableReason ?? null

  const isLoading =
    profileQuery.isLoading || ownerQuery.isLoading || isCanEditLoading

  if (isLoading) return <LoadingMessage />

  if (profileQuery.error) {
    return (
      <ErrorMessage
        compact
        description="Error fetching records. Please refresh the page."
      />
    )
  }

  if (unresolvableReason) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeading parent={{ type: 'name', name }}>Records</PageHeading>
        <NoResultsMessage
          title="This name does not resolve"
          description={UNRESOLVABLE_COPY[unresolvableReason]}
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
      protocolVersion={ownerQuery.data?.protocolVersion}
    />
  )
}
