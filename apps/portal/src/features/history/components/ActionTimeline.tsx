import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { formatTimelineDate } from '../formatTimelineDate'
import type { Action } from '../summarize/summarize.types'
import { ActionSummaryRow } from './ActionSummaryRow'

/**
 * The rail geometry every timeline row reads from. Rows position their icon
 * badge and disclosure content off these vars, so any timeline — the full
 * History page, the Overview's Recent History, the per-facet views — has to be
 * wrapped in this frame.
 */
export const TimelineFrame = ({
  children,
  className,
}: {
  readonly children: ReactNode
  readonly className?: string
}) => (
  <div
    className={cn(
      'relative min-w-0 overflow-x-clip overflow-y-visible pr-3 [--detail-indent:36px] [--rail-x:12px] [--tier2-indent:30px] lg:[--detail-indent:224px] lg:[--rail-x:151px] lg:[--tier2-indent:182px]',
      className,
    )}
  >
    {children}
  </div>
)

interface ActionTimelineProps {
  readonly actions: readonly Action[]
  readonly openIds: ReadonlySet<string>
  readonly onToggle: (txHash: string) => void
  /**
   * Continue the rail past the edge of this group. Set when the group is one of
   * several inside a frame (e.g. the Overview splits recent rows from the
   * oldest row around a "see full history" gap).
   */
  readonly connectAbove?: boolean
  readonly connectBelow?: boolean
}

/**
 * A run of tier-1 action rows joined by the timeline rail, with the date column
 * shown only on the first row of each day.
 */
export const ActionTimeline = ({
  actions,
  openIds,
  onToggle,
  connectAbove = false,
  connectBelow = false,
}: ActionTimelineProps) => (
  <div className="relative flex flex-col">
    {actions.map((action, index) => (
      <ActionSummaryRow
        key={action.txHash}
        action={action}
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
