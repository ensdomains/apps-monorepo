import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { NameSubgraphHistory } from '@/components/table/NameSubgraphHistory/NameSubgraphHistory'
import { V1NameManagerRecord } from '@/features/ownership/components/V1NameManagerRecord'
import { ExpiryWithRegistrationData } from '@/features/profile/components/ExpiryWithRegistrationData'
import { GraceBanner } from '@/features/profile/components/GraceBanner'
import { Owner } from '@/features/profile/components/Owner'
import { ParentName } from '@/features/profile/components/ParentName'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { useGraceStatus } from '@/features/profile/hooks/useGraceStatus'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { useCanExtend } from '@/features/renew/hooks/useCanExtend'
import { isRegistrable } from '@/utils/ens/tldHelpers'

export const Route = createFileRoute('/$name/ownership')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { name } = Route.useParams()

  const { data, isLoading, error } = useQuery(getEnsOwnerQueryOptions({ name }))

  const availabilityQuery = useQuery({
    ...getNameAvailabilityQueryOptions({ name }),
    enabled: isRegistrable(name),
  })

  const grace = useGraceStatus({
    name,
    protocolVersion: data?.protocolVersion,
  })

  const { canExtend: graceCanExtend } = useCanExtend({
    name,
    protocolVersion: data?.protocolVersion ?? 'ENSv2',
    enabled: grace.isInGrace,
  })

  if (error)
    return (
      <ErrorMessage
        title="Failed to fetch owner"
        description={error.cause.message}
      />
    )

  if (isLoading || (availabilityQuery.isLoading && isRegistrable(name)))
    return <LoadingMessage />

  if (availabilityQuery.error)
    return (
      <ErrorMessage
        title="Error checking availability"
        description={
          availabilityQuery.error.cause?.message ||
          availabilityQuery.error.message
        }
      />
    )

  if (availabilityQuery.data?.isAvailable || !data)
    return (
      <NotFoundMessage
        title="Name not registered"
        description={
          <>
            <strong>{name}</strong> is not registered, so there is no ownership
            data to display.
          </>
        }
      />
    )

  return (
    <div className="flex flex-col gap-8">
      {grace.isInGrace && grace.graceEndDate && (
        <GraceBanner
          graceEndDate={grace.graceEndDate}
          canExtend={graceCanExtend}
        />
      )}
      <div className="flex flex-row justify-between">
        <h1 className="text-h1">Ownership</h1>
      </div>
      {/* Header list — same structure as the Overview/Resolver pages (WEB-649) */}
      <div className="flex flex-col">
        <ExpiryWithRegistrationData
          name={name}
          protocolVersion={data.protocolVersion}
        />
        <Owner
          owner={data.owner}
          label={grace.isInGrace ? 'Previous owner' : 'Owner'}
          asRow
        />
        {data.protocolVersion === 'ENSv1' && (
          <V1NameManagerRecord name={name} asRow />
        )}
        <ParentName name={name} asRow />
      </div>
      <NameSubgraphHistory name={name} category="domain" />
    </div>
  )
}
