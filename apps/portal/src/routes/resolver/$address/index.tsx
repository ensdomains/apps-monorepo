import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Clock, GridIcon, SplitIcon, UserRoundCog } from 'lucide-react'
import { sepolia } from 'viem/chains'
import { CounterCard, CounterCardRow } from '@/components/CounterCard'
import { ErrorMessage } from '@/components/ErrorMessage'
import { HistorySectionHeader } from '@/components/HistorySectionHeader'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import {
  inlineAddressHeadingClassName,
  PageHeading,
} from '@/components/PageHeading'
import { Button } from '@/components/ui/button'
import { ResolverDetails } from '@/features/resolver/components/ResolverDetails'
import { ResolverEventsTable } from '@/features/resolver/components/ResolverEventsTable'
import { ResolverTypeValue } from '@/features/resolver/components/ResolverTypeValue'
import {
  getResolverOverviewQueryOptions,
  resolverCollectionCount,
} from '@/features/resolver/hooks/useResolverOverview'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { queryClient } from '@/utils/queryClient'
import type { HttpsUrl } from '@/utils/types'

export const Route = createFileRoute('/resolver/$address/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) => {
    return queryClient.prefetchQuery(
      getResolverOverviewQueryOptions({
        address: params.address,
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
  } = useQuery(getResolverOverviewQueryOptions({ address: address }))

  const recentEvents = (resolver?.events ?? [])
    .toSorted(
      (a, b) => (b.timestamp ?? b.blockNumber) - (a.timestamp ?? a.blockNumber),
    )
    .slice(0, RECENT_EVENT_LIMIT)

  if (isLoading) return <LoadingMessage />

  if (error)
    return (
      <ErrorMessage
        title="Resolver unavailable"
        description={extractErrorMessage(error, '')}
      />
    )

  return (
    <div className="flex flex-col gap-8">
      <PageHeading>
        Resolver{' '}
        <span className={inlineAddressHeadingClassName}>
          {truncateAddress(address)}
        </span>
      </PageHeading>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <CounterCard to="/resolver/$address/nodes" params={{ address }}>
          <CounterCardRow icon={GridIcon}>
            <span className="font-medium">
              {resolver?.nodeCount ?? 0}
              {resolver?.nodeCountIsLowerBound && '+'}
            </span>{' '}
            nodes
          </CounterCardRow>
        </CounterCard>

        <CounterCard to="/resolver/$address/roles" params={{ address }}>
          <CounterCardRow icon={UserRoundCog}>
            <span className="font-medium">
              {resolverCollectionCount(
                resolver?.roleHolderCount,
                resolver?.rolesStatus,
              )}
            </span>{' '}
            roles
          </CounterCardRow>
        </CounterCard>

        <CounterCard to="/resolver/$address/links" params={{ address }}>
          <CounterCardRow icon={SplitIcon}>
            <span className="font-medium">
              {resolverCollectionCount(
                resolver?.linkCount,
                resolver?.linksStatus,
              )}
            </span>{' '}
            links
          </CounterCardRow>
        </CounterCard>
      </div>

      <ResolverDetails
        resolverAddress={address}
        typeValue={<ResolverTypeValue resolverAddress={address} />}
        data={[
          {
            label: 'Contract',
            value: address,
            href: `${sepoliaUrl}/address/${address}` as HttpsUrl,
          },
        ]}
      />

      <div className="flex flex-col gap-4 w-full">
        <HistorySectionHeader
          action={
            <Button
              variant="ghost"
              size="sm"
              className="text-neutral-7"
              asChild
            >
              <Link to="/resolver/$address/history" params={{ address }}>
                <Clock className="size-4" />
                Full history
              </Link>
            </Button>
          }
        />
        {recentEvents.length === 0 ? (
          <NoResultsMessage
            title="No history yet"
            description="Events for this resolver will appear here."
            className="mx-0 my-0"
          />
        ) : (
          <ResolverEventsTable events={recentEvents} enableSidebar={false} />
        )}
      </div>
    </div>
  )
}
