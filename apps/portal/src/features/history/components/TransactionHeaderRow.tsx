import type { Hash } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { useBlockExplorerTxUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { formatExpiryDate } from '@/utils/formatting/formatDateTime'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { unixSecondsToPlainDateUtc } from '@/utils/temporal'
import { formatTimelineTime } from '../formatTimelineDate'
import type { TimelineEvent } from '../timelineEvent'
import { TransactionSenderBadge, type TransactionSenders } from './AccountBadge'
import { TransactionMeta } from './EventDetail'
import { ExpandableDetailRow } from './ExpandableDetailRow'

interface TransactionHeaderRowProps {
  readonly event: TimelineEvent
  readonly txHash: Hash
  readonly senders: TransactionSenders
}

export const TransactionHeaderRow = ({
  event,
  txHash,
  senders,
}: TransactionHeaderRowProps) => {
  const txUrl = useBlockExplorerTxUrl(txHash)

  return (
    <ExpandableDetailRow
      left={
        <>
          <TransactionSenderBadge txHash={txHash} senders={senders} />
          <span className="text-muted-foreground text-p">
            initiated at {formatTimelineTime(event.timestamp)}
          </span>
        </>
      }
      right={
        <EntityBadge
          variant="tx"
          label={formatExpiryDate(unixSecondsToPlainDateUtc(event.timestamp))}
          copyValue={txHash}
          etherscanHref={txUrl}
          compact
        >
          {truncateAddress(txHash)}
        </EntityBadge>
      }
      disclosure={<TransactionMeta event={event} txHash={txHash} />}
    />
  )
}
