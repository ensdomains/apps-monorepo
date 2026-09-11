import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ClockIcon } from 'lucide-react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { ShieldPersonIcon } from '@/assets/icons'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NameNotRegisteredMessage } from '@/components/NameNotRegisteredMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { Button } from '@/components/ui/button'
import { HistoryTimeline } from '@/features/history/components/HistoryTimeline'
import { ReclaimManagerButton } from '@/features/ownership/components/ReclaimManagerButton'
import { V1NameManagerRecord } from '@/features/ownership/components/V1NameManagerRecord'
import { ExpiryWithRegistrationData } from '@/features/profile/components/ExpiryWithRegistrationData'
import { GraceBanner } from '@/features/profile/components/GraceBanner'
import { InfoRow } from '@/features/profile/components/InfoRow'
import { Owner } from '@/features/profile/components/Owner'
import { ParentName } from '@/features/profile/components/ParentName'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { useGraceStatus } from '@/features/profile/hooks/useGraceStatus'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { useCanExtend } from '@/features/renew/hooks/useCanExtend'
import { useCanTransfer } from '@/features/transfer/hooks/useCanTransfer'
import { getV1NameStateQueryOptions } from '@/features/transfer/v1/getV1NameState'
import { getV1Holder } from '@/features/transfer/v1/rules'
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

/**
 * `resolveEnsOwner` reports the *controller* of an unwrapped `.eth` 2LD, so the
 * Owner row reads the holder from the full V1 shape instead. Its own component
 * because the read depends on `protocolVersion` (STYLEGUIDE, query waterfalls).
 */
const V1OwnerRow = ({
  name,
  label,
  registryOwner,
}: {
  readonly name: string
  readonly label: string
  readonly registryOwner: Address
}) => {
  const { data, isLoading, error } = useQuery(
    getV1NameStateQueryOptions({ name }),
  )

  // Row-shaped states: the full-size blocks would break the header list.
  if (error)
    return (
      <InfoRow icon={ShieldPersonIcon} label={label}>
        <span className="text-sm text-muted-foreground">
          Failed to load owner
        </span>
      </InfoRow>
    )
  if (isLoading)
    return (
      <InfoRow icon={ShieldPersonIcon} label={label}>
        <span className="text-sm text-muted-foreground">Loading</span>
      </InfoRow>
    )
  // No result and no error — a paused query, or no V1 owner at any level.
  if (!data)
    return (
      <InfoRow icon={ShieldPersonIcon} label={label}>
        <span className="text-sm text-muted-foreground">Owner unavailable</span>
      </InfoRow>
    )

  // A lapsed name has no holder — the 721 `ownerOf` reverts in grace.
  return (
    <Owner
      asRow
      label={label}
      owner={data.subject ? getV1Holder(data.subject) : registryOwner}
    />
  )
}

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
      <NameNotRegisteredMessage
        name={name}
        description={
          <>
            <strong>{name}</strong> is not registered, so there is no ownership
            data to display.
          </>
        }
      />
    )

  const ownerLabel = grace.isInGrace ? 'Previous owner' : 'Owner'

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
        <div className="flex flex-row items-center gap-2">
          <ReclaimManagerButton
            name={name}
            protocolVersion={data.protocolVersion}
            account={address}
          />
          {canTransfer && (
            <Button asChild className="gap-2">
              <Link params={{ name }} to="/$name/ownership/transfer">
                Transfer
              </Link>
            </Button>
          )}
        </div>
      </div>
      {/* Header list — same structure as the Overview/Resolver pages (WEB-649) */}
      <div className="flex flex-col">
        <ExpiryWithRegistrationData
          name={name}
          protocolVersion={data.protocolVersion}
        />
        {data.protocolVersion === 'ENSv1' ? (
          <V1OwnerRow
            name={name}
            label={ownerLabel}
            registryOwner={data.owner}
          />
        ) : (
          <Owner asRow label={ownerLabel} owner={data.owner} />
        )}
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
