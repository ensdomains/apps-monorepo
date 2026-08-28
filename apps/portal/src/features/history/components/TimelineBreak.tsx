import type { ReactNode } from 'react'
import { Rail } from '@/components/ui/timeline'
import { cn } from '@/lib/utils'

/**
 * The gap in a timeline where history exists but is not on screen.
 *
 * A row with no date and no icon, joined to the rows above and below by a
 * *dashed* rail — the rail keeps running because the history does, and the dash
 * is what says the run is not continuous. Figma Explorer-V1 nodes `2075:16136`
 * (Overview) and `2539:49421` (History page) are the same row; only the text
 * inside it differs.
 *
 * 14px / 0.02em / neutral-7 are the Figma values, a step down from the 15px
 * `text-p` token used for row content. Alignment comes from `--label-x`, the
 * same variable the action rows start their label at, so the break lines up
 * with the text above it rather than with the rail.
 */
export const TimelineBreak = ({
  children,
}: {
  readonly children: ReactNode
}) => (
  <div className="relative py-2.5">
    <Rail className="inset-y-0" connection="dashed" />
    <div className="pl-(--label-x) text-[14px] text-neutral-7 tracking-[0.02em]">
      {children}
    </div>
  </div>
)

/**
 * The underlined, interactive half of a break row — "Load 100 more", "full
 * History". A `<button>` and a `<Link>` have to look identical here, so the
 * styling lives in one place.
 */
export const timelineBreakActionClassName =
  'underline [text-underline-position:from-font] hover:text-foreground disabled:cursor-default disabled:no-underline disabled:opacity-60'

/**
 * "Load N more events (M total)".
 *
 * The count is the feed's, not the loaded rows' — it is what pressing this
 * would work through. While a page is in flight the label says so in place,
 * keeping the row height and the rail unbroken.
 */
export const TimelineLoadMore = ({
  pageSize,
  totalCount,
  isLoading,
  onLoadMore,
}: {
  readonly pageSize: number
  readonly totalCount: number | undefined
  readonly isLoading: boolean
  readonly onLoadMore: () => void
}) => (
  <TimelineBreak>
    <button
      type="button"
      onClick={onLoadMore}
      disabled={isLoading}
      className={cn(timelineBreakActionClassName, 'cursor-pointer')}
    >
      {isLoading ? 'Loading…' : `Load ${pageSize} more`}
    </button>
    {!isLoading && ' events'}
    {totalCount !== undefined && ` (${totalCount} total)`}
  </TimelineBreak>
)
