import { useInfiniteQuery } from '@tanstack/react-query'
import { match, P } from 'ts-pattern'
import type { Address } from 'viem'
import { BlockExplorerTxLink } from '@/components/BlockExplorerTxLink'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { timelineBreakActionClassName } from '@/features/history/components/TimelineBreak'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { truncateName } from '@/utils/formatting/truncateName'
import { getRecentActivityQueryOptions } from '../hooks/useRecentActivity'
import {
  formatActivityEvent,
  formatRelativeTime,
} from '../utils/formatActivityEvent'

export const RecentActivityTable = () => {
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(getRecentActivityQueryOptions())
  const events = data?.pages.flatMap((page) => page.events) ?? []

  return (
    <div className="flex flex-col overflow-hidden w-full">
      <div className="flex gap-2 h-12 items-center border-b border-border shrink-0">
        <span className="text-caps">Recent Activity</span>
      </div>
      {match({ isLoading, error, count: events.length })
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
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            No recent activity
          </div>
        ))
        .otherwise(() =>
          events.map((event, index) => {
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
            const nameEntity = resolvedName
              ? { type: 'name' as const, value: resolvedName }
              : entityFromData

            const txHash = event.transactionHash

            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: a single transaction can emit multiple events of the same type, so the index is required to disambiguate otherwise-identical rows
                key={`${txHash}-${event.type}-${index}`}
                className="flex flex-col sm:flex-row sm:gap-6 sm:items-center sm:py-2 border-b border-border last:border-b-0"
              >
                {/* Mobile: top row — entity left, time right
                  Desktop: sm:contents spreads children into parent flex */}
                <div className="flex items-center justify-between pt-3 pb-1 sm:contents">
                  <div className="sm:order-2 sm:w-32 sm:shrink-0">
                    {match(nameEntity)
                      .with({ type: 'name' }, ({ value }) => (
                        <EntityBadge variant="name" name={value}>
                          {truncateName(value)}
                        </EntityBadge>
                      ))
                      .with({ type: 'address' }, ({ value }) => (
                        <EntityBadge
                          variant="address"
                          address={value as Address}
                        >
                          {truncateAddress(value, 6, 4)}
                        </EntityBadge>
                      ))
                      .otherwise(() => (
                        <BlockExplorerTxLink txHash={txHash} inline />
                      ))}
                  </div>
                  <span className="sm:order-1 font-mono text-xs sm:text-sm text-muted-foreground sm:w-24 sm:shrink-0 tabular-nums">
                    {formatRelativeTime(event.timestamp)}
                  </span>
                </div>

                {/* Mobile: bottom row — description + actor wrapping
                  Desktop: right-aligned flex */}
                <div className="sm:order-3 flex flex-wrap items-center gap-1 pb-3 sm:pb-0 sm:flex-nowrap sm:flex-1 sm:gap-2 sm:justify-end sm:min-w-0">
                  <span className="text-sm text-muted-foreground sm:truncate">
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
                  {match(actor)
                    .with({ type: 'address' }, ({ value }) => (
                      <EntityBadge variant="address" address={value as Address}>
                        {truncateAddress(value, 6, 4)}
                      </EntityBadge>
                    ))
                    .with({ type: 'name' }, ({ value }) => (
                      <EntityBadge variant="name" name={value}>
                        {truncateName(value)}
                      </EntityBadge>
                    ))
                    .otherwise(() => null)}
                </div>
              </div>
            )
          }),
        )}
      {/* Quotes no number, like the timeline's own break: the remainder would
          read as what one click fetches when it is what several would. */}
      {events.length > 0 && hasNextPage && (
        <button
          type="button"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className={cn(
            timelineBreakActionClassName,
            'w-fit cursor-pointer py-2.5 text-[14px] text-neutral-7 tracking-[0.02em]',
          )}
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more events'}
        </button>
      )}
    </div>
  )
}
