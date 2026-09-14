import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ClockIcon } from 'lucide-react'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { Button } from '@/components/ui/button'
import { HistoryTimeline } from '@/features/history/components/HistoryTimeline'
import { V1NameManagerRecord } from '@/features/ownership/components/V1NameManagerRecord'
import { ExpiryWithRegistrationData } from '@/features/profile/components/ExpiryWithRegistrationData'
import { GraceBanner } from '@/features/profile/components/GraceBanner'
import { Owner } from '@/features/profile/components/Owner'
import { ParentName } from '@/features/profile/components/ParentName'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { useGraceStatus } from '@/features/profile/hooks/useGraceStatus'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { useCanExtend } from '@/features/renew/hooks/useCanExtend'
import { useCanTransfer } from '@/features/transfer/hooks/useCanTransfer'
import { isRegistrable } from '@/utils/ens/tldHelpers'

/**
 * The ownership facet of the name's history: registration, renewals, expiry and
 * every kind of owner change — the registry's owner, the registrar's registrant
 * and the wrapper's owner/fuses. Resolver and record writes are the Resolver
 * page's facet, so they stay out of this one.
 *
 * Named by the types the summarize engine sees, which for v1 means their
 * post-adapter names — `adaptV1Events` renames the registry's `Transfer` to
 * `RegistryTransfer` and `ExpiryExtended` to `ExpiryUpdated`.
 */
const OWNERSHIP_HISTORY_EVENT_TYPES = [
  'LabelRegistered',
  'NameRegistered',
  'NameRenewed',
  'ExpiryUpdated',
  'NewOwner',
  'Transfer',
  'RegistryTransfer',
  'NameTransferred',
  'WrappedTransfer',
  'NameWrapped',
  'NameUnwrapped',
  'FusesSet',
] as const

export const Route = createFileRoute('/$name/ownership/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { name } = Route.useParams()
  const { address } = useConnection()

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

  const canTransfer = useCanTransfer({ name, owner: data, account: address })

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
      <div className="flex flex-row items-center justify-between">
        <PageHeading parent={{ type: 'name', name }}>Ownership</PageHeading>
        {canTransfer && (
          <Button asChild className="gap-2">
            <Link params={{ name }} to="/$name/ownership/transfer">
              Transfer
            </Link>
          </Button>
        )}
      </div>
      {/* Header list — same structure as the Overview/Resolver pages (WEB-649) */}
      <div className="flex flex-col">
        <ExpiryWithRegistrationData
          name={name}
          protocolVersion={data.protocolVersion}
        />
        <Owner
          asRow
          label={grace.isInGrace ? 'Previous owner' : 'Owner'}
          owner={data.owner}
        />
        {data.protocolVersion === 'ENSv1' && (
          <V1NameManagerRecord asRow name={name} />
        )}
        <ParentName asRow name={name} />
      </div>
      <HistoryTimeline
        name={name}
        scope={OWNERSHIP_HISTORY_EVENT_TYPES}
        heading={<h2 className="text-caps text-foreground">History</h2>}
        emptyTitle="No ownership history"
        emptyDescription="Registrations, renewals and transfers for this name will appear here as they happen."
        action={
          <Button variant="outline" size="xs" asChild>
            <Link to="/$name/history" params={{ name }}>
              <ClockIcon className="size-4" />
              Full history
            </Link>
          </Button>
        }
      />
    </div>
  )
}
