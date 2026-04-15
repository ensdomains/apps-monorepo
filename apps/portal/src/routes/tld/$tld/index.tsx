import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ClockIcon } from 'lucide-react'
import { useMemo } from 'react'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { CardsStackIcon, HubIcon } from '@/assets/icons'
import { CopyButton } from '@/components/CopyButton'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { NameSubgraphHistory } from '@/components/table/NameSubgraphHistory/NameSubgraphHistory'
import { Button } from '@/components/ui/button'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { Owner } from '@/features/profile/components/Owner'
import { getDnsSecEnabledQueryOptions } from '@/features/profile/hooks/useDnsSecEnabled'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import {
  type GetTldDataReturnType,
  getTldDataQueryOptions,
} from '@/features/profile/hooks/useTldData'
import { getV2NameHistoryQueryOptions } from '@/features/profile/hooks/useV2NameHistory'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { transformV2EventsToSubgraphFormat } from '@/utils/history/transformV2Events'
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

const ParentRoot = ({
  rootRegistryAddress,
}: {
  rootRegistryAddress: Address
}) => {
  const content = (
    <>
      <NameAvatar width="40px" height="40px" name="[root]" />
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Parent</span>
        <span>[root]</span>
      </div>
    </>
  )

  const className =
    'h-21.5 px-6 flex flex-row rounded-sm gap-6 items-center border border-border hover:bg-muted'

  return (
    <Link
      to="/addr/$addr"
      params={{ addr: rootRegistryAddress }}
      className={className}
    >
      {content}
    </Link>
  )
}

const TldRecordCount = ({ tld }: { tld: string }) => {
  const tldDataQuery = useQuery(getTldDataQueryOptions({ tld }))
  const profileQuery = useQuery(
    getProfileQueryOptions({
      name: tld,
      protocolVersion: tldDataQuery.data?.protocolVersion,
    }),
  )

  const recordCount = useMemo(() => {
    if (profileQuery.data?.records)
      return recordsToTableData(profileQuery.data.records).length
    return 0
  }, [profileQuery.data?.records])

  return (
    <div className="h-21.5 w-full flex rounded-sm overflow-hidden border border-border items-center">
      <div className="w-full px-6 flex flex-row items-center gap-6">
        <CardsStackIcon className="size-8 shrink-0 text-[#191919] dark:text-[#595755]" />
        <div className="flex-1">
          <span className="font-medium text-foreground">{recordCount}</span>{' '}
          <span className="text-muted-foreground">records set</span>
        </div>
      </div>
    </div>
  )
}

const TldRegistryCard = ({
  registryAddress,
}: {
  registryAddress: GetTldDataReturnType['registryAddress']
}) => {
  const hasRegistry = registryAddress !== zeroAddress

  return (
    <div className="h-21.5 w-full flex rounded-sm overflow-hidden border border-border items-center">
      <div className="w-full px-6 flex flex-row items-center gap-6">
        <HubIcon className="size-8 shrink-0 text-[#191919] dark:text-[#595755]" />
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-sm text-muted-foreground">Registry</span>
          {hasRegistry ? (
            <div className="flex items-center gap-1 min-w-0">
              <EntityBadge variant="contract">
                {truncateAddress(registryAddress, 6, 4, '...')}
              </EntityBadge>
              <CopyButton value={registryAddress} />
            </div>
          ) : (
            <span className="text-muted-foreground">No registry deployed</span>
          )}
        </div>
      </div>
    </div>
  )
}

const ProtocolCard = () => (
  <div className="h-21.5 w-full flex rounded-sm overflow-hidden border border-border items-center">
    <div className="w-full px-6 flex flex-row items-center gap-6">
      <span className="size-8 shrink-0 flex items-center justify-center text-lg font-bold text-[#191919] dark:text-[#595755]">
        #
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Protocol</span>
        <span>ENSv2</span>
      </div>
    </div>
  </div>
)

const HistorySection = ({ tld }: { tld: string }) => {
  const v2HistoryQuery = useQuery(getV2NameHistoryQueryOptions({ name: tld }))

  if (v2HistoryQuery.isLoading) {
    return <LoadingSpinner title="Loading history..." />
  }

  if (v2HistoryQuery.error) {
    return (
      <ErrorMessage
        title={v2HistoryQuery.error.name}
        description={
          v2HistoryQuery.error.cause?.message || v2HistoryQuery.error.message
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-medium">History</h2>
        <Button variant="secondary" size="sm" disabled>
          <ClockIcon className="size-4" />
          Full history
        </Button>
      </div>
      <NameSubgraphHistory
        name={tld}
        v2Events={transformV2EventsToSubgraphFormat(v2HistoryQuery.data || [])}
        enableHeader={false}
      />
    </div>
  )
}

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
    return (
      <ErrorMessage
        title={dnsSecQuery.error.name}
        description={dnsSecQuery.error.message}
      />
    )
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
    return (
      <ErrorMessage
        title={tldDataQuery.error.cause.name}
        description={tldDataQuery.error.cause.message}
      />
    )
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
    <div className="flex flex-col gap-12 p-10 w-full max-w-360 mx-auto">
      <div className="flex flex-row justify-between items-center">
        <h1 className="text-heading font-medium leading-none">{tld}</h1>
        <CopyButton value={tld} />
      </div>

      <div className="flex flex-col gap-3">
        {/* Owner + Parent */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Owner owner={owner ?? undefined} />
          <ParentRoot rootRegistryAddress={rootRegistryAddress} />
        </div>

        {/* Records / Registry / Protocol */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <TldRecordCount tld={tld} />
          <TldRegistryCard registryAddress={registryAddress} />
          <ProtocolCard />
        </div>

        {/* History */}
        <HistorySection tld={tld} />
      </div>
    </div>
  )
}
