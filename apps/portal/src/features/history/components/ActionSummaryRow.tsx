import {
  EntityBadge,
  entityBadgeLeadingPadScope,
} from '@/components/EntityBadge'
import { type RailConnection, TimelineRow } from '@/components/ui/timeline'
import { cn } from '@/lib/utils'
import { formatTimelineDate } from '../formatTimelineDate'
import type { Action } from '../summarize/summarize.types'
import type { TransactionSenders } from './AccountBadge'
import { ActionSlots } from './ActionSlots'
import { ACTION_ICONS } from './actionIcons'
import { EventRow } from './EventRow'
import { TransactionHeaderRow } from './TransactionHeaderRow'

interface ActionSummaryRowProps {
  readonly action: Action
  readonly senders: TransactionSenders
  /**
   * Lead the row with the account that sent the transaction. Off on a name's
   * own history, where every row is something the name did; on for a feed
   * whose subject is not the actor, such as a registry contract's.
   */
  readonly showActor?: boolean
  readonly showDate?: boolean
  readonly isOpen: boolean
  readonly onToggle: () => void
  readonly connectRailAbove?: RailConnection
  readonly connectRailBelow?: RailConnection
}

export const ActionSummaryRow = ({
  action,
  senders,
  showActor = false,
  showDate = true,
  isOpen,
  onToggle,
  connectRailAbove = false,
  connectRailBelow = false,
}: ActionSummaryRowProps) => {
  const eventCount = action.events.length
  const dateLabel = formatTimelineDate(action.timestamp)
  const desktopDateLabel = showDate ? dateLabel : ''
  const Glyph = ACTION_ICONS[action.icon]

  const iconBadge = (
    <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-md bg-neutral-1 p-1.5 text-muted-foreground ring-[3px] ring-neutral-0 group-hover/row:bg-neutral-2 group-hover/row:ring-neutral-1">
      <Glyph className="size-4 text-neutral-5" strokeWidth={2.5} aria-hidden />
    </span>
  )
  const labelAndChips = (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1',
        entityBadgeLeadingPadScope,
      )}
    >
      {showActor && (
        <ActionSlots
          slots={[{ kind: 'actor', txHash: action.txHash }]}
          senders={senders}
        />
      )}
      <span className={cn('text-neutral-7 text-p', showActor && '-ml-2')}>
        {action.label}
      </span>
      <ActionSlots slots={action.slots} senders={senders} />
    </div>
  )
  const counts = (
    <div className="flex items-center gap-2 whitespace-nowrap @2xl/timeline:gap-3">
      <EntityBadge variant="default" className="gap-1">
        {eventCount}
        <span className="@2xl/timeline:hidden"> evt</span>
        <span className="hidden @2xl/timeline:inline">
          {` ${eventCount === 1 ? 'event' : 'events'}`}
        </span>
      </EntityBadge>
      <EntityBadge variant="tx">1 tx</EntityBadge>
    </div>
  )

  return (
    <TimelineRow
      isOpen={isOpen}
      onToggle={onToggle}
      connectRailAbove={connectRailAbove}
      connectRailBelow={connectRailBelow}
      disclosure={
        <div className="flex flex-col gap-y-2 pt-2">
          <TransactionHeaderRow event={action.events[0]} senders={senders} />
          {action.events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      }
    >
      <div className="flex gap-2 py-2 @2xl/timeline:hidden">
        {iconBadge}
        <div className="flex min-w-0 flex-1 flex-col gap-4 @2xl/timeline:gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] text-muted-foreground">
              {dateLabel}
            </span>
            <div className="ml-auto">{counts}</div>
          </div>
          {labelAndChips}
        </div>
      </div>

      {/* First column is `--label-x` less the gap, so the frame's label column
          and this grid cannot drift apart. */}
      <div className="hidden min-w-0 grid-cols-[calc(var(--label-x)-0.75rem)_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 @2xl/timeline:grid">
        <div className="flex items-center gap-5">
          <span className="w-30 shrink-0 text-right font-mono text-[13px] text-muted-foreground">
            {desktopDateLabel}
          </span>
          {iconBadge}
        </div>
        {labelAndChips}
        <div className="justify-self-end">{counts}</div>
      </div>
    </TimelineRow>
  )
}
