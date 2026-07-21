import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { TimelineRow } from '@/components/ui/timeline'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import {
  formatTimelineFullDate,
  formatTimelineTime,
} from '../formatTimelineDate'
import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import { TransactionMeta } from './EventDetail'
import { DETAIL_INDENT, RAIL_X, TIER2_INDENT } from './timelineGeometry'

interface TransactionHeaderRowProps {
  /** A representative event from the transaction (for timestamp / hash / block). */
  readonly event: TimelineIndexerEvent
  /** The transaction sender, if resolved. */
  readonly actor?: string
}

/**
 * Tier-2 "transaction" row: `{actor} initiated at {time}` on the left, the tx date +
 * hash on the right, expanding to the transaction metadata (Figma "Transaction details").
 */
export const TransactionHeaderRow = ({
  event,
  actor,
}: TransactionHeaderRowProps) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <TimelineRow
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      disclosure={
        <div className="py-1" style={{ paddingLeft: `${DETAIL_INDENT}px` }}>
          <TransactionMeta event={event} txHash={event.transactionHash} />
        </div>
      }
    >
      <div
        className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2 pr-3"
        style={{ paddingLeft: `${TIER2_INDENT}px` }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 h-full w-px bg-border"
          style={{ left: `${RAIL_X}px` }}
        />
        <div className="flex min-w-0 items-center gap-2">
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
              isOpen && 'rotate-180',
            )}
          />
          {actor && (
            <EntityBadge variant="address" address={actor as Address}>
              {truncateAddress(actor)}
            </EntityBadge>
          )}
          <span className="text-muted-foreground text-sm">
            {actor ? 'initiated at' : 'Transaction initiated at'}{' '}
            {formatTimelineTime(event.timestamp)}
          </span>
        </div>
        <div className="flex items-center gap-2 justify-self-end whitespace-nowrap">
          <span className="text-[13px] text-warning-text">
            {formatTimelineFullDate(event.timestamp)}
          </span>
          <EntityBadge variant="tx" copyValue={event.transactionHash}>
            {truncateAddress(event.transactionHash)}
          </EntityBadge>
        </div>
      </div>
    </TimelineRow>
  )
}
