import { useState } from 'react'
import { EntityBadge } from '@/components/EntityBadge'
import { TimelineRow } from '@/components/ui/timeline'
import { formatTimelineDate } from '../formatTimelineDate'
import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import type { Action } from '../summarize/summarize.types'
import { ActionSlots } from './ActionSlots'
import { ActionIconGlyph } from './actionIcons'
import { EventRow } from './EventRow'
import { TransactionHeaderRow } from './TransactionHeaderRow'
import { RAIL_X } from './timelineGeometry'

/** Group an action's events by transaction, preserving order. */
const groupEventsByTx = (
  events: readonly TimelineIndexerEvent[],
): TimelineIndexerEvent[][] => {
  const groups = new Map<string, TimelineIndexerEvent[]>()
  for (const event of events) {
    const key = event.transactionHash.toLowerCase()
    const group = groups.get(key)
    if (group) group.push(event)
    else groups.set(key, [event])
  }
  return [...groups.values()]
}

interface ActionSummaryRowProps {
  readonly action: Action
  /** Date labels are grouped — only the first row of a date shows it (Figma). */
  readonly showDate?: boolean
}

/**
 * Tier-1 summary row. Matches the Figma anatomy: a 3-column grid
 * [date+icon rail (180px) | label + entity chips | counts], a 24px icon badge sitting
 * on the vertical rail (the affordance — no chevron), and the tx count as an amber pill.
 */
export const ActionSummaryRow = ({
  action,
  showDate = true,
}: ActionSummaryRowProps) => {
  const [isOpen, setIsOpen] = useState(false)

  const eventCount = action.events.length
  const txCount = action.txHashes.length
  const txGroups = groupEventsByTx(action.events)

  return (
    <TimelineRow
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      disclosure={
        <div className="flex flex-col">
          {txGroups.map((group) => (
            <div key={group[0].transactionHash} className="flex flex-col">
              <TransactionHeaderRow event={group[0]} />
              {group.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          ))}
        </div>
      }
    >
      <div className="relative grid grid-cols-[180px_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 pr-3">
        {/* Vertical rail — runs behind the icon badge (which masks it at the node). */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 h-full w-px bg-border"
          style={{ left: `${RAIL_X}px` }}
        />

        {/* Col 1: date + icon badge */}
        <div className="flex items-center gap-5">
          <span className="w-[120px] shrink-0 text-right font-mono text-[13px] text-muted-foreground">
            {showDate ? formatTimelineDate(action.timestamp) : ''}
          </span>
          <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-lg border-[3px] border-background bg-muted text-muted-foreground">
            <ActionIconGlyph icon={action.icon} />
          </span>
        </div>

        {/* Col 2: label + entity chips */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[14px] text-foreground">{action.label}</span>
          <ActionSlots slots={action.slots} />
        </div>

        {/* Col 3: counts */}
        <div className="flex items-center gap-3 justify-self-end whitespace-nowrap">
          <span className="font-mono text-[13px] text-muted-foreground">
            {eventCount} {eventCount === 1 ? 'event' : 'events'}
          </span>
          <EntityBadge variant="tx">{txCount} tx</EntityBadge>
        </div>
      </div>
    </TimelineRow>
  )
}
