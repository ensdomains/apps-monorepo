import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { zeroAddress } from 'viem'
import { CardsStackIcon, HubIcon, SupervisorAccountIcon } from '@/assets/icons'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { HistoryTimeline } from '@/features/history/components/HistoryTimeline'
import { InfoRow } from '@/features/profile/components/InfoRow'
import { Owner } from '@/features/profile/components/Owner'
import { ProtocolRow } from '@/features/profile/components/ProtocolRow'
import { getDnsSecEnabledQueryOptions } from '@/features/profile/hooks/useDnsSecEnabled'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import {
  type GetTldDataReturnType,
  getTldDataQueryOptions,
} from '@/features/profile/hooks/useTldData'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { queryClient } from '@/utils/queryClient'
import { recordsToTableData } from '@/utils/records/recordsToTableData'

export const Route = createFileRoute('/tld/$tld/')({
  component: TldOverview,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) =>
    params.tld !== 'eth'
      ? queryClient.prefetchQuery(
          getDnsSecEnabledQueryOptions({ tld: params.tld }),
        )
      : undefined,
})

/** Chevron-less counter card: the TLD subpages these would link to are not
    live yet, so the counters are display-only. */
const TldCounterCard = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
}) => (
  <div className="flex items-center gap-3 p-4 rounded-lg bg-background border border-secondary">
    <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
      <div className="flex items-center gap-2 text-muted-foreground min-w-0">
        <Icon className="size-4 shrink-0" />
        <span className="text-sm truncate">{label}</span>
      </div>
      <span className="text-xl font-medium text-foreground shrink-0">
        {value}
      </span>
    </div>
  </div>
)

const TldRecordCount = ({ tld }: { tld: string }) => {
  const profileQuery = useQuery(getProfileQueryOptions({ name: tld }))

  const recordCount = useMemo(() => {
    if (profileQuery.data?.records)
      return recordsToTableData(profileQuery.data.records).length
    return 0
  }, [profileQuery.data?.records])

  return (
    <TldCounterCard
      icon={CardsStackIcon}
      label="Records set"
      value={recordCount}
    />
  )
}

const TldRegistryRow = ({
  registryAddress,
}: {
  registryAddress: GetTldDataReturnType['registryAddress']
}) => (
  <InfoRow icon={HubIcon} label="Registry">
    {registryAddress !== zeroAddress ? (
      <EntityBadge variant="contract" address={registryAddress}>
        {truncateAddress(registryAddress, 6, 4, '...')}
      </EntityBadge>
    ) : (
      <span className="text-sm text-muted-foreground">
        No registry deployed
      </span>
    )}
  </InfoRow>
)

// The TLD's whole feed, paged, as a name's history is.
const HistorySection = ({ tld }: { tld: string }) => (
  <HistoryTimeline
    name={tld}
    showFilters={false}
    heading={<h2 className="text-foreground text-heading">History</h2>}
    emptyTitle="No recent activity"
    emptyDescription="Events will appear here as they happen."
  />
)

function TldOverview() {
  const { tld } = Route.useParams()
  const isEthTld = tld === 'eth'

  const dnsSecQuery = useQuery(
    getDnsSecEnabledQueryOptions({
      tld,
      enabled: !isEthTld,
    }),
  )
  const isTldValid = isEthTld || dnsSecQuery.data === true

  const tldDataQuery = useQuery({
    ...getTldDataQueryOptions({ tld }),
    enabled: isTldValid,
  })

  if (!isEthTld && dnsSecQuery.isLoading) return <LoadingMessage />

  if (dnsSecQuery.error) {
    return <ErrorMessage />
  }

  if (!isTldValid) {
    return (
      <NotFoundMessage
        title="TLD not found"
        description={
          <>
            The TLD <strong>{tld}</strong> does not have any data in ENS yet.
          </>
        }
      />
    )
  }

  if (tldDataQuery.isLoading) return <LoadingMessage />

  if (tldDataQuery.error) {
    return <ErrorMessage />
  }

  if (!tldDataQuery.data) {
    return (
      <NotFoundMessage
        title="TLD not found"
        description={
          <>
            The TLD <strong>{tld}</strong> does not have any data in ENS yet.
          </>
        }
      />
    )
  }

  const { owner, registryAddress, rootRegistryAddress } = tldDataQuery.data

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-h1">{tld}</h1>

      {/* Main section: metadata rows | counters */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="flex flex-col flex-1">
          <Owner owner={owner ?? undefined} asRow />
          <InfoRow icon={SupervisorAccountIcon} label="Parent">
            <EntityBadge variant="contract" address={rootRegistryAddress}>
              [root]
            </EntityBadge>
          </InfoRow>
          <TldRegistryRow registryAddress={registryAddress} />
          <ProtocolRow protocolVersion="ENSv2" />
        </div>

        <div className="flex flex-col gap-3 shrink-0">
          <TldRecordCount tld={tld} />
        </div>
      </div>

      {/* History */}
      <HistorySection tld={tld} />
    </div>
  )
}
