import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Clock } from 'lucide-react'
import { useMemo } from 'react'
import { type Address, isAddress, isAddressEqual } from 'viem'
import { useConnection, useDisconnect, useEnsName } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { HistorySectionHeader } from '@/components/HistorySectionHeader'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { addressHeadingClassName, PageHeading } from '@/components/PageHeading'
import { NameSubgraphHistory } from '@/components/table/NameSubgraphHistory/NameSubgraphHistory'
import { Button } from '@/components/ui/button'
import { getV2HistoryForAddressQueryOptions } from '@/features/address/components/hooks/useV2HistoryForAddress'
import { selectAcquiredNames } from '@/features/address/nameAttribution'
import { NameList } from '@/features/dashboard/components/NameList'
import { NameProfileCard } from '@/features/profile/components/NameProfileCard'
import { cn } from '@/lib/utils'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { groupAddressHistoryByName } from '@/utils/history/transformAddressHistory'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/addr/$addr/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) =>
    queryClient.prefetchQuery(
      getV2HistoryForAddressQueryOptions({
        address: params.addr as Address,
      }),
    ),
})

interface PrimaryNameProps {
  address: Address
}

const PrimaryName = ({ address }: PrimaryNameProps) => {
  const {
    data: name,
    isLoading,
    error,
  } = useEnsName({
    address,
  })

  if (error) {
    return (
      <ErrorMessage
        title="Error loading data"
        description={extractErrorMessage(error)}
      />
    )
  }

  if (isLoading) return <LoadingMessage />

  if (name) return <NameProfileCard name={name} />
  return null
}

interface AddressHistoryProps {
  address: Address
}

const RECENT_EVENT_LIMIT = 5

const AddressRecentHistory = ({ address }: AddressHistoryProps) => {
  const { data: v2Names } = useQuery(
    getV2HistoryForAddressQueryOptions({ address }),
  )

  const groups = useMemo(
    () => groupAddressHistoryByName(undefined, v2Names),
    [v2Names],
  )

  // Structural attribution only: judging a name by who sent its transactions costs
  // one `getTransaction` per event, and an attacker controls how many events a
  // planted name has — an unbounded RPC burst on a page anyone can load for any
  // address. The cost is that a subname the address really uses is missing from this
  // teaser; it is one click away, correctly attributed, under "Full history".
  const recentEvents = useMemo(
    () =>
      selectAcquiredNames(groups, address, undefined)
        .flatMap((group) => group.events)
        .toSorted((a, b) => b.blockNumber - a.blockNumber)
        .slice(0, RECENT_EVENT_LIMIT),
    [groups, address],
  )

  return (
    <div className="flex flex-col gap-4 w-full">
      <HistorySectionHeader
        action={
          <Button variant="ghost" size="sm" className="text-neutral-7" asChild>
            <Link to="/addr/$addr/history" params={{ addr: address }}>
              <Clock className="size-4" />
              Full history
            </Link>
          </Button>
        }
      />
      <NameSubgraphHistory
        name={address}
        category="domain"
        v2Events={recentEvents}
        enableHeader={false}
      />
    </div>
  )
}

function RouteComponent() {
  const { disconnect } = useDisconnect()
  const { address: connectedAddress } = useConnection()
  const { addr } = Route.useParams() as { addr: Address }

  const isViewingConnectedWallet =
    !!connectedAddress &&
    isAddress(addr) &&
    isAddressEqual(connectedAddress, addr)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2 lg:flex-row justify-between items-baseline">
        <PageHeading className={cn(addressHeadingClassName, 'break-all')}>
          {addr}
        </PageHeading>
        {isViewingConnectedWallet && (
          <Button variant="default" onClick={() => disconnect()}>
            Disconnect
          </Button>
        )}
      </div>
      <PrimaryName address={addr} />
      <h2 className="text-h2">Names</h2>
      <NameList address={addr} limit={3} />
      <AddressRecentHistory address={addr} />
    </div>
  )
}
