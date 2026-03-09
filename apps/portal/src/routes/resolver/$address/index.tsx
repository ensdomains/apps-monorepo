import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Clock, GridIcon, SplitIcon, UserRoundCog } from 'lucide-react'
import { useMemo } from 'react'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import {
  CounterCard,
  CounterCardLink,
  CounterCardRow,
} from '@/components/CounterCard'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { Button } from '@/components/ui/button'
import { DedicatedResolverBanner } from '@/features/resolver/components/DedicatedResolverBanner'
import { ResolverDetails } from '@/features/resolver/components/ResolverDetails'
import { ResolverEventsTable } from '@/features/resolver/components/ResolverEventsTable'
import { getResolverOverviewQueryOptions } from '@/features/resolver/hooks/useResolverOverview'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { queryClient } from '@/utils/queryClient'
import type { HttpsUrl } from '@/utils/types'

export const Route = createFileRoute('/resolver/$address/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) => {
    return queryClient.prefetchQuery(
      getResolverOverviewQueryOptions({
        address: params.address as Address,
      }),
    )
  },
})

const sepoliaUrl = sepolia.blockExplorers.default.url
const RECENT_EVENT_LIMIT = 5

function RouteComponent() {
  const { address } = Route.useParams()

  const {
    data: resolver,
    isLoading,
    error,
  } = useQuery(getResolverOverviewQueryOptions({ address: address as Address }))

  const recentEvents = useMemo(() => {
    const events = resolver?.events ?? []
    return events
      .toSorted(
        (a, b) =>
          (b.timestamp ?? b.blockNumber) - (a.timestamp ?? a.blockNumber),
      )
      .slice(0, RECENT_EVENT_LIMIT)
  }, [resolver?.events])

  if (isLoading) return <LoadingMessage />
  if (error)
    return (
      <ErrorMessage
        title="Resolver unavailable"
        description={error.cause?.message}
      />
    )

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 w-full max-w-360 mx-auto">
      <h1 className="text-2xl md:text-heading font-medium leading-none">
        Resolver {truncateAddress(address, 6, 4, '...')}
      </h1>

      <DedicatedResolverBanner resolverAddress={address as Address} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <CounterCard>
          <CounterCardRow
            icon={GridIcon}
            action={
              <CounterCardLink
                to="/resolver/$address/nodes"
                params={{ address }}
              />
            }
          >
            <span className="font-medium">{resolver?.nodeCount ?? 0}</span>{' '}
            nodes
          </CounterCardRow>
        </CounterCard>

        <CounterCard>
          <CounterCardRow
            icon={UserRoundCog}
            action={
              <CounterCardLink
                to="/resolver/$address/roles"
                params={{ address }}
              />
            }
          >
            <span className="font-medium">
              {resolver?.roleHolderCount ?? 0}
            </span>{' '}
            roles
          </CounterCardRow>
        </CounterCard>

        <CounterCard>
          <CounterCardRow
            icon={SplitIcon}
            action={
              <CounterCardLink
                to="/resolver/$address/aliases"
                params={{ address }}
              />
            }
          >
            <span className="font-medium">{resolver?.aliasCount ?? 0}</span>{' '}
            aliases
          </CounterCardRow>
        </CounterCard>
      </div>

      <ResolverDetails
        resolverAddress={address as Address}
        data={[
          {
            label: 'Contract',
            value: address,
            href: `${sepoliaUrl}/address/${address}` as HttpsUrl,
          },
        ]}
      />

      <div className="flex flex-col gap-4 w-full">
        <div className="flex flex-row justify-between items-center">
          <h2 className="text-2xl font-medium">History</h2>
          <Button variant="secondary" size="sm" asChild>
            <Link to="/resolver/$address/history" params={{ address }}>
              <Clock className="size-4" />
              Full history
            </Link>
          </Button>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <ResolverEventsTable events={recentEvents} enableSidebar={false} />
        </div>
      </div>
    </div>
  )
}
