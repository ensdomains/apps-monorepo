import { EntityBadge } from '@/components/EntityBadge'
import { useBlockExplorerTxUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { formatExpiryDate } from '@/utils/formatting/formatDateTime'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { unixSecondsToPlainDateUtc } from '@/utils/temporal'
import { formatTimelineTime } from '../formatTimelineDate'
import type { TimelineIndexerEvent } from '../timelineEvent'
import { TransactionSenderBadge, type TransactionSenders } from './AccountBadge'
import { TransactionMeta } from './EventDetail'
import { ExpandableDetailRow } from './ExpandableDetailRow'

interface TransactionHeaderRowProps {
  readonly event: TimelineIndexerEvent
  readonly senders: TransactionSenders
}

export const TransactionHeaderRow = ({
  event,
  senders,
}: TransactionHeaderRowProps) => {
  const txUrl = useBlockExplorerTxUrl(event.transactionHash)

  return (
    <ExpandableDetailRow
      left={
        <>
          <TransactionSenderBadge
            txHash={event.transactionHash}
            senders={senders}
          />
          <span className="text-muted-foreground text-p">
            initiated at {formatTimelineTime(event.timestamp)}
          </span>
        </>
      }
      right={
        <EntityBadge
          variant="tx"
          label={formatExpiryDate(unixSecondsToPlainDateUtc(event.timestamp))}
          copyValue={event.transactionHash}
          etherscanHref={txUrl}
          compact
        >
          {truncateAddress(event.transactionHash)}
        </EntityBadge>
      }
      disclosure={
        <TransactionMeta event={event} txHash={event.transactionHash} />
      }
    />
  )
}
