import type { NameDetail } from '@ens-apps/indexer/reads'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { match } from 'ts-pattern'
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

// An ENSv1 name with no ENSv2 entry still has its records on the ENSv1
// resolver, and the upgrade copies them.
const unresolvableCopy = (detail: NameDetail): string =>
  match(detail)
    .with(
      { unresolvableReason: 'ens_v2_path_no_resolver' },
      () =>
        'No resolver is set on the path to this name, so it does not resolve and has no records to show.',
    )
    .with(
      { registrationStatus: 'released' },
      () =>
        "This name's registration has ended and it is open to register, so it does not resolve.",
    )
    .with(
      { registrationStatus: 'expired' },
      () =>
        "This name's registration has lapsed, so it does not resolve. Its ENSv1 records are kept and come back when it is renewed.",
    )
    .otherwise(
      () =>
        'This ENSv1 name is not reserved in ENSv2, so it does not resolve here. Its ENSv1 records are kept and move across when it is upgraded.',
    )

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
  const {
    canEdit,
    editLock,
    isLoading: isCanEditLoading,
  } = useCanEditRecords({ name })
  const { data: detail } = useQuery(getNameDetailQueryOptions({ name }))

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

  if (detail?.unresolvableReason) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeading parent={{ type: 'name', name }}>Records</PageHeading>
        <NoResultsMessage
          title="This name does not resolve"
          description={unresolvableCopy(detail)}
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
      editLock={editLock}
      protocolVersion={ownerQuery.data?.protocolVersion}
    />
  )
}
