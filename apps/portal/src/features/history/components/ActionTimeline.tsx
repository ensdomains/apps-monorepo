import type { RailConnection } from '@/components/ui/timeline'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import { formatTimelineDate } from '../formatTimelineDate'
import type { Action } from '../summarize/summarize.types'
import { ActionSummaryRow } from './ActionSummaryRow'

interface ActionTimelineProps {
  readonly actions: readonly Action[]
  readonly openIds: ReadonlySet<string>
  readonly onToggle: (actionId: string) => void
  /** Lead each row with the transaction sender — see `ActionSummaryRow`. */
  readonly showActor?: boolean
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
 * shown only on the first row of each day. Senders are one batched lookup for
 * the run, deferred until a row needs them.
 */
export const ActionTimeline = ({
  actions,
  openIds,
  onToggle,
  showActor = false,
  connectAbove = false,
  connectBelow = false,
}: ActionTimelineProps) => {
  const senders = useTransactionSenders({
    transactionHashes: actions.flatMap((action) =>
      action.txHash ? [action.txHash] : [],
    ),
    enabled: showActor || actions.some((action) => openIds.has(action.id)),
  })

  return (
    <div className="relative flex flex-col">
      {actions.map((action, index) => (
        <ActionSummaryRow
          key={action.id}
          action={action}
          senders={senders}
          showActor={showActor}
          isOpen={openIds.has(action.id)}
          onToggle={() => onToggle(action.id)}
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
