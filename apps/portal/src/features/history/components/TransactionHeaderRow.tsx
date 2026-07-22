import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { EntityBadge } from '@/components/EntityBadge'
import { TimelineRow } from '@/components/ui/timeline'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import {
  formatTimelineFullDate,
  formatTimelineTime,
} from '../formatTimelineDate'
import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import { AccountBadge } from './AccountBadge'
import { TransactionMeta } from './EventDetail'

interface TransactionHeaderRowProps {
  /** A representative event from the transaction (for timestamp / hash / block). */
  readonly event: TimelineIndexerEvent
}

/**
 * Tier-2 "transaction" row: `{actor} initiated at {time}` on the left, the tx date +
 * hash on the right, expanding to the transaction metadata (Figma "Transaction details").
 */
export const TransactionHeaderRow = ({ event }: TransactionHeaderRowProps) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <TimelineRow
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      disclosure={
        <div className="py-1 pl-(--detail-indent)">
          <TransactionMeta event={event} txHash={event.transactionHash} />
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-y-1 py-2 pr-3 pl-(--tier2-indent) sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-3 sm:gap-y-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
              isOpen && 'rotate-180',
            )}
          />
          <AccountBadge txHash={event.transactionHash} />
          <span className="text-muted-foreground text-sm">
            initiated at {formatTimelineTime(event.timestamp)}
          </span>
        </div>
        <div className="flex items-center gap-2 justify-self-start whitespace-nowrap sm:justify-self-end">
          <span className="text-[13px] text-warning-text">
            {formatTimelineFullDate(event.timestamp)}
          </span>
          <EntityBadge variant="tx" copyValue={event.transactionHash} compact>
            {truncateAddress(event.transactionHash)}
          </EntityBadge>
        </div>
      </div>
    </TimelineRow>
  )
}
