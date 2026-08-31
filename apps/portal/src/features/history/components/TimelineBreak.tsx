import type { ReactNode } from 'react'
import { Rail } from '@/components/ui/timeline'
import { cn } from '@/lib/utils'

/**
 * The gap where history exists but is not on screen. Figma Explorer-V1
 * `2075:16136` (Overview) and `2539:49421` (History) are the same row.
 *
 * 14px / 0.02em / neutral-7 are the Figma values; `--label-x` is what the action
 * rows start their label at, so the break lines up with the text above it.
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

/** A `<button>` and a `<Link>` must look identical here, so this lives in one place. */
export const timelineBreakActionClassName =
  'underline [text-underline-position:from-font] hover:text-foreground disabled:cursor-default disabled:no-underline disabled:opacity-60'

/**
 * Quotes no increment, unlike Figma's "Load 100 more": the page size bounds a v2
 * fetch, but what appears is that page plus whatever the new horizon uncovers —
 * on fox.eth a 50-event page rendered 107 rows' worth, and the next click added
 * 138 more. Any number here would be wrong for the names that most need paging.
 */
export const TimelineLoadMore = ({
  totalCount,
  isLoading,
  onLoadMore,
}: {
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
      {isLoading ? 'Loading…' : 'Load more'}
    </button>
    {!isLoading && ' events'}
    {totalCount !== undefined && ` (${totalCount} total)`}
  </TimelineBreak>
)
