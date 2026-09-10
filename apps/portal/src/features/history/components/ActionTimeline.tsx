import type { Hex } from 'viem'
import type { RailConnection } from '@/components/ui/timeline'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import { formatTimelineDate } from '../formatTimelineDate'
import type { Action } from '../summarize/summarize.types'
import { ActionSummaryRow } from './ActionSummaryRow'

interface ActionTimelineProps {
  readonly actions: readonly Action[]
  readonly openIds: ReadonlySet<Hex>
  readonly onToggle: (txHash: Hex) => void
  /**
   * Continue the rail past the edge of this group. Set when the group is one of
   * several inside a frame (e.g. the Overview splits recent rows from the
   * oldest row around a "see full history" gap). `'dashed'` when what the run
   * spans is history the frame is not showing.
   */
  readonly connectAbove?: RailConnection
  readonly connectBelow?: RailConnection
}

/**
 * A run of tier-1 action rows joined by the timeline rail, with the date column
 * shown only on the first row of each day.
 *
 * Every row leads with its transaction's sender, so the senders are looked up
 * here as one batched request for the run rather than one RPC per row.
 */
export const ActionTimeline = ({
  actions,
  openIds,
  onToggle,
  connectAbove = false,
  connectBelow = false,
}: ActionTimelineProps) => {
  const senders = useTransactionSenders({
    transactionHashes: actions.map((action) => action.txHash),
  })

  return (
    <div className="relative flex flex-col">
      {actions.map((action, index) => (
        <ActionSummaryRow
          key={action.txHash}
          action={action}
          senders={senders}
          isOpen={openIds.has(action.txHash)}
          onToggle={() => onToggle(action.txHash)}
          connectRailAbove={index > 0 || connectAbove}
          connectRailBelow={index < actions.length - 1 || connectBelow}
          showDate={
            index === 0 ||
            formatTimelineDate(actions[index - 1].timestamp) !==
              formatTimelineDate(action.timestamp)
          }
        />
      ))}
    </div>
  )
}
