import type { ReactNode } from 'react'
import type { Hex } from 'viem'
import type { RailConnection } from '@/components/ui/timeline'
import { formatTimelineDate } from '../formatTimelineDate'
import type { Action } from '../summarize/summarize.types'
import { ActionSummaryRow } from './ActionSummaryRow'

/**
 * The rail geometry every timeline row reads from, so any timeline — the full
 * History page, the Overview's Recent History, the per-facet views — has to be
 * wrapped in this frame.
 *
 * Wide vs narrow is a container query, not a viewport breakpoint, so the same
 * timeline lays itself out correctly in a full-width page and in the ~600px
 * Address resolution sheet, where a viewport `lg:` would wrongly pick the
 * three-column layout. `@2xl` (672px) is just under the History page's own
 * content box at the `lg` viewport (1024px − 256px nav − 80px padding = 688px),
 * so that page is unaffected.
 *
 * The container has to be its own element: `container-type` only exposes a box
 * to its *descendants*, so declaring it alongside the `@2xl/timeline:` variables
 * below would leave them stuck at their narrow values while the rows inside
 * switched to wide — wide rows against mobile rail geometry.
 *
 * `--label-x` is where an action's label starts: the row grid derives its first
 * column from it, and non-row content in the frame (the Overview's "see full
 * history" break) lines up with it. It is one step short of `--detail-indent`,
 * which belongs to the expanded event detail under a row.
 */
export const TimelineFrame = ({
  children,
}: {
  readonly children: ReactNode
}) => (
  <div className="@container/timeline min-w-0">
    <div className="relative min-w-0 overflow-x-clip overflow-y-visible pr-3 [--detail-indent:36px] [--label-x:32px] [--rail-x:12px] [--tier2-indent:30px] @2xl/timeline:[--detail-indent:224px] @2xl/timeline:[--label-x:192px] @2xl/timeline:[--rail-x:151px] @2xl/timeline:[--tier2-indent:182px]">
      {children}
    </div>
  </div>
)

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
