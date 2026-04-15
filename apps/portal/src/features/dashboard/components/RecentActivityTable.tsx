import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { EntityBadge } from '@/components/EntityBadge'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { getRecentActivityQueryOptions } from '../hooks/useRecentActivity'
import {
  formatActivityEvent,
  formatRelativeTime,
} from '../utils/formatActivityEvent'

export const RecentActivityTable = () => {
  const { data, isLoading } = useQuery(getRecentActivityQueryOptions())

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border w-full">
      <div className="flex gap-2 h-12 items-center px-4 border-b border-border shrink-0">
        <span className="font-medium text-sm tracking-widest uppercase">
          Recent Activity
        </span>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner title="Loading recent activity..." />
        </div>
      ) : !data?.length ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          No recent activity
        </div>
      ) : (
        data.map((event) => {
          const { text, actor, entityFromData } = formatActivityEvent(event)
          const resolvedName =
            event.name?.trim() || event.domain?.name?.trim() || null
          const nameEntity = resolvedName
            ? { type: 'name' as const, value: resolvedName }
            : entityFromData

          return (
            <div
              key={event.transactionHash}
              className="flex gap-6 items-center px-4 py-4 border-b border-border last:border-b-0"
            >
              <span className="font-mono text-sm text-muted-foreground w-24 shrink-0 tabular-nums">
                {formatRelativeTime(event.timestamp)}
              </span>
              <div className="w-32 shrink-0">
                {nameEntity &&
                  (nameEntity.type === 'name' ? (
                    <Link to="/$name" params={{ name: nameEntity.value }}>
                      <EntityBadge variant="name">
                        {nameEntity.value}
                      </EntityBadge>
                    </Link>
                  ) : (
                    <Link to="/addr/$addr" params={{ addr: nameEntity.value }}>
                      <EntityBadge variant="address">
                        {truncateAddress(nameEntity.value, 6, 4)}
                      </EntityBadge>
                    </Link>
                  ))}
              </div>
              <div className="flex flex-1 items-center gap-2 justify-end min-w-0 overflow-hidden">
                <span className="text-sm text-muted-foreground truncate">
                  {text}
                </span>
                {actor &&
                  (actor.type === 'address' ? (
                    <Link
                      to="/addr/$addr"
                      params={{ addr: actor.value }}
                      className="shrink-0"
                    >
                      <EntityBadge variant="address">
                        {truncateAddress(actor.value, 6, 4)}
                      </EntityBadge>
                    </Link>
                  ) : (
                    <Link
                      to="/$name"
                      params={{ name: actor.value }}
                      className="shrink-0"
                    >
                      <EntityBadge variant="name">{actor.value}</EntityBadge>
                    </Link>
                  ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
