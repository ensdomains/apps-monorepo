import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Clock } from 'lucide-react'
import type { Address } from 'viem'
import { useAccount, useDisconnect, useEnsName } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { NameSubgraphHistory } from '@/components/table/NameSubgraphHistory/NameSubgraphHistory'
import { Button } from '@/components/ui/button'
import { getV2HistoryForAddressQueryOptions } from '@/features/address/components/hooks/useV2HistoryForAddress'
import { NameList } from '@/features/dashboard/components/NameList'
import { NameProfileCard } from '@/features/profile/components/NameProfileCard'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { transformV2EventsToSubgraphFormat } from '@/utils/history/transformV2Events'
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
  const { data: v2Events } = useQuery(
    getV2HistoryForAddressQueryOptions({ address }),
  )

  const recentEvents = v2Events
    ? transformV2EventsToSubgraphFormat(
        v2Events
          .toSorted((a, b) => b.timestamp - a.timestamp)
          .slice(0, RECENT_EVENT_LIMIT),
      )
    : undefined

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-row justify-between items-center">
        <h2 className="text-2xl font-medium">History</h2>
        <Button variant="secondary" size="sm" asChild>
          <Link to="/addr/$addr/history" params={{ addr: address }}>
            <Clock className="size-4" />
            Full history
          </Link>
        </Button>
      </div>
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
  const { isConnected } = useAccount()
  const { addr } = Route.useParams() as { addr: Address }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 w-full max-w-360 mx-auto">
      <div className="flex flex-col gap-2 lg:flex-row justify-between items-baseline">
        <h1 className="text-2xl md:text-heading font-medium leading-none break-all">
          {addr}
        </h1>
        {isConnected && (
          <Button variant="secondary" onClick={() => disconnect()}>
            Disconnect
          </Button>
        )}
      </div>
      <PrimaryName address={addr} />
      <h2 className="font-medium text-2xl">Names</h2>
      <NameList address={addr} limit={3} />
      <AddressRecentHistory address={addr} />
    </div>
  )
}
