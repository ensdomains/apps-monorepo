import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { EntityBadge } from '@/components/EntityBadge'
import { TimelineRow } from '@/components/ui/timeline'
import { cn } from '@/lib/utils'
import { useBlockExplorerTxUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { formatExpiryDate } from '@/utils/formatting/formatDateTime'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { unixSecondsToPlainDateUtc } from '@/utils/temporal'
import { formatTimelineTime } from '../formatTimelineDate'
import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import { AccountBadge } from './AccountBadge'
import { TransactionMeta } from './EventDetail'

interface TransactionHeaderRowProps {
  readonly event: TimelineIndexerEvent
}

export const TransactionHeaderRow = ({ event }: TransactionHeaderRowProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const txUrl = useBlockExplorerTxUrl(event.transactionHash)

  return (
    <TimelineRow
      isOpen={isOpen}
      hoverHighlight={false}
      onToggle={() => setIsOpen((open) => !open)}
      className="ml-(--tier2-indent) pl-2"
      disclosure={
        <div className="py-1 pl-(--detail-indent)">
          <TransactionMeta event={event} txHash={event.transactionHash} />
        </div>
      }
    >
      <div className="flex items-start gap-2 py-2 pr-3">
        <span className="inline-flex shrink-0 items-center justify-center rounded-md bg-neutral-1 p-1 text-neutral-5">
          <ChevronDown
            className={cn(
              'size-5.25 stroke-[1.25] transition-transform duration-150',
              isOpen && 'rotate-180 text-neutral-7',
            )}
            aria-hidden
          />
        </span>
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-3 sm:gap-y-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <AccountBadge txHash={event.transactionHash} />
            <span className="text-muted-foreground text-sm">
              initiated at {formatTimelineTime(event.timestamp)}
            </span>
          </div>
          <div className="justify-self-start whitespace-nowrap sm:justify-self-end">
            <EntityBadge
              variant="tx"
              label={formatExpiryDate(
                unixSecondsToPlainDateUtc(event.timestamp),
              )}
              copyValue={event.transactionHash}
              etherscanHref={txUrl}
              compact
            >
              {truncateAddress(event.transactionHash)}
            </EntityBadge>
          </div>
        </div>
      </div>
    </TimelineRow>
  )
}
