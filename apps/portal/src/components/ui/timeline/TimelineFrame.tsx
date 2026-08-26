import type { ReactNode } from 'react'

/**
 * The rail geometry every timeline row reads from. Rows position their icon
 * badge and disclosure content off these vars, so any timeline — the full
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
    <div className="relative overflow-x-clip overflow-y-visible pr-3 [--detail-indent:36px] [--label-x:32px] [--rail-x:12px] [--tier2-indent:30px] @2xl/timeline:[--detail-indent:224px] @2xl/timeline:[--label-x:192px] @2xl/timeline:[--rail-x:151px] @2xl/timeline:[--tier2-indent:182px]">
      {children}
    </div>
  </div>
)
