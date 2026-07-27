import { EntityBadge } from '@/components/EntityBadge'
import { TimelineRow } from '@/components/ui/timeline'
import { formatTimelineDate } from '../formatTimelineDate'
import type { Action } from '../summarize/summarize.types'
import { groupByTransaction } from '../summarize/summarizeEvents'
import { ActionSlots } from './ActionSlots'
import { ActionIconGlyph } from './actionIcons'
import { EventRow } from './EventRow'
import { TransactionHeaderRow } from './TransactionHeaderRow'

interface ActionSummaryRowProps {
  readonly action: Action
  /** Date labels are grouped — only the first row of a date shows it (Figma). */
  readonly showDate?: boolean
  /** Controlled open state (driven by the row and by "Expand all"). */
  readonly isOpen: boolean
  readonly onToggle: () => void
}

/**
 * Tier-1 summary row. Desktop is the Figma 3-column grid
 * [date+icon rail (180px) | label + chips | counts]; mobile stacks it — icon + date +
 * counts on the top line, label + chips below. The pieces are computed once and placed
 * into the two layout shells so nothing is duplicated but the markup.
 */
export const ActionSummaryRow = ({
  action,
  showDate = true,
  isOpen,
  onToggle,
}: ActionSummaryRowProps) => {
  const eventCount = action.events.length
  const txCount = action.txHashes.length
  const txGroups = groupByTransaction(action.events)
  const dateLabel = showDate ? formatTimelineDate(action.timestamp) : ''

  const iconBadge = (
    <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-lg border-[3px] border-background bg-muted text-muted-foreground">
      <ActionIconGlyph icon={action.icon} />
    </span>
  )
  const labelAndChips = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="text-foreground text-sm">{action.label}</span>
      <ActionSlots slots={action.slots} />
    </div>
  )
  const counts = (
    <div className="flex items-center gap-2 whitespace-nowrap sm:gap-3">
      <span className="font-mono text-muted-foreground text-sm">
        {eventCount}
        <span className="sm:hidden"> evt</span>
        <span className="hidden sm:inline">
          {` ${eventCount === 1 ? 'event' : 'events'}`}
        </span>
      </span>
      <EntityBadge variant="tx">{txCount} tx</EntityBadge>
    </div>
  )

  return (
    <TimelineRow
      isOpen={isOpen}
      onToggle={onToggle}
      disclosure={
        <div className="flex flex-col gap-y-4 pt-4">
          {txGroups.map((group) => (
            <div
              key={group[0].transactionHash}
              className="flex flex-col gap-y-4"
            >
              <TransactionHeaderRow event={group[0]} />
              {group.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          ))}
        </div>
      }
    >
      {/* Mobile: icon + date + counts on top, label + chips below */}
      <div className="flex gap-2 py-2 pr-2 sm:hidden">
        {iconBadge}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] text-muted-foreground">
              {dateLabel}
            </span>
            <div className="ml-auto">{counts}</div>
          </div>
          {labelAndChips}
        </div>
      </div>

      {/* Desktop: date + icon rail | label + chips | counts */}
      <div className="hidden grid-cols-[180px_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 pr-3 sm:grid">
        <div className="flex items-center gap-5">
          <span className="w-[120px] shrink-0 text-right font-mono text-[13px] text-muted-foreground">
            {dateLabel}
          </span>
          {iconBadge}
        </div>
        {labelAndChips}
        <div className="justify-self-end">{counts}</div>
      </div>
    </TimelineRow>
  )
}
