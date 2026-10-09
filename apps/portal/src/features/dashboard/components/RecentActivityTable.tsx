import { useInfiniteQuery } from '@tanstack/react-query'
import { match, P } from 'ts-pattern'
import { BlockExplorerTxLink } from '@/components/BlockExplorerTxLink'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { ListLoader } from '@/components/ListLoader/ListLoader'
import {
  infiniteFetchMore,
  useListLoader,
} from '@/components/ListLoader/useListLoader'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { truncateName } from '@/utils/formatting/truncateName'
import {
  getRecentActivityQueryOptions,
  RECENT_ACTIVITY_PAGE_SIZE,
} from '../hooks/useRecentActivity'
import {
  formatActivityEvent,
  formatRelativeTime,
} from '../utils/formatActivityEvent'

export const RecentActivityTable = () => {
  const {
    data,
    isLoading,
    error,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery(getRecentActivityQueryOptions())
  const events = data?.pages.flatMap((page) => page.events) ?? []

  const loader = useListLoader({
    initialCount: RECENT_ACTIVITY_PAGE_SIZE,
    loaded: events.length,
    total: data?.pages.at(-1)?.totalCount,
    hasMore: hasNextPage,
    fetchMore: infiniteFetchMore(fetchNextPage, (page) => page.events.length),
  })

  return (
    <div className="flex flex-col w-full">
      <div className="flex gap-2 h-12 items-center border-b border-border shrink-0">
        <span className="text-caps">Recent Activity</span>
      </div>
      {match({
        isLoading,
        error: isFetchNextPageError ? null : error,
        count: events.length,
      })
        .with({ isLoading: true }, () => (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner title="Loading recent activity..." />
          </div>
        ))
        .with({ error: P.nonNullable }, () => (
          <ErrorMessage
            compact
            className="my-4"
            description="Error fetching recent activity. Please refresh the page."
          />
        ))
        .with({ count: 0 }, () => (
          <div className="flex items-center justify-center py-8 text-base text-muted-foreground">
            No recent activity
          </div>
        ))
        .otherwise(() =>
          events.slice(0, loader.shown).map((event, index) => {
            const { text, value, actor, entityFromData } =
              formatActivityEvent(event)
            const rawName =
              event.name?.trim() || event.domain?.name?.trim() || null
            const resolvedName =
              rawName &&
              !rawName.startsWith('tokenId:') &&
              !rawName.startsWith('canonicalId:')
                ? rawName
                : null
            const txHash = event.transactionHash

            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: one tx can emit identical events
                key={`${txHash}-${event.type}-${index}`}
                className="flex flex-col sm:flex-row sm:gap-6 sm:items-center sm:py-2 border-b border-border last:border-b-0"
              >
                {/* Desktop: sm:contents spreads these into the parent flex. */}
                <div className="flex items-center justify-between pt-3 pb-1 sm:contents">
                  <div className="sm:order-2 sm:w-32 sm:shrink-0">
                    {match({ name: resolvedName, address: entityFromData })
                      .with({ name: P.string }, ({ name }) => (
                        <EntityBadge variant="name" name={name}>
                          {truncateName(name)}
                        </EntityBadge>
                      ))
                      .with({ address: P.string }, ({ address }) => (
                        <EntityBadge variant="address" address={address}>
                          {truncateAddress(address, 6, 4)}
                        </EntityBadge>
                      ))
                      .otherwise(() => (
                        <BlockExplorerTxLink txHash={txHash} inline />
                      ))}
                  </div>
                  <span className="sm:order-1 text-smallmono sm:text-entity-base text-muted-foreground sm:w-24 sm:shrink-0 tabular-nums">
                    {formatRelativeTime(event.timestamp)}
                  </span>
                </div>

                <div className="sm:order-3 flex flex-wrap items-center gap-1 pb-3 sm:pb-0 sm:flex-nowrap sm:flex-1 sm:gap-2 sm:justify-end sm:min-w-0">
                  <span className="text-base text-muted-foreground sm:truncate">
                    {text}
                  </span>
                  {value && (
                    <EntityBadge
                      variant="default"
                      format="truncate"
                      className="max-w-40"
                    >
                      {value}
                    </EntityBadge>
                  )}
                  {actor && (
                    <EntityBadge variant="address" address={actor}>
                      {truncateAddress(actor, 6, 4)}
                    </EntityBadge>
                  )}
                </div>
              </div>
            )
          }),
        )}
      <ListLoader {...loader} className="py-2.5" />
    </div>
  )
}
