import { cn } from '@/lib/utils'

export type ListLoaderProps = {
  readonly shown: number
  /** How many rows `More` will show. */
  readonly moreCount: number
  readonly total: number | undefined
  readonly canShowMore: boolean
  readonly status: 'idle' | 'loading' | 'error'
  readonly onMore: () => void
  readonly onAll: () => void
  readonly onStop: () => void
  readonly className?: string
}

const ACTION_CLASS_NAME =
  'cursor-pointer underline underline-offset-2 hover:text-foreground disabled:cursor-default disabled:no-underline disabled:opacity-60'

/** `Showing X of Y · More · All`. More doubles the rows shown; All shows the rest. */
export const ListLoader = ({
  shown,
  moreCount,
  total,
  canShowMore,
  status,
  onMore,
  onAll,
  onStop,
  className,
}: ListLoaderProps) => {
  if (!canShowMore && (total === undefined || shown >= total)) return null

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 font-semi-mono text-sm text-neutral-7',
        className,
      )}
    >
      <span>
        Showing {shown}
        {total !== undefined && ` of ${total}`}
      </span>
      {canShowMore && (
        <>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onMore}
            disabled={status === 'loading'}
            title={`Show ${moreCount}`}
            className={ACTION_CLASS_NAME}
          >
            More
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onAll}
            disabled={status === 'loading'}
            title={total === undefined ? 'Show all' : `Show all ${total}`}
            className={ACTION_CLASS_NAME}
          >
            All
          </button>
        </>
      )}
      {status === 'loading' && (
        <>
          <span role="status">Loading…</span>
          <button
            type="button"
            onClick={onStop}
            title="Stop loading"
            className={ACTION_CLASS_NAME}
          >
            Stop
          </button>
        </>
      )}
      {status === 'error' && <span role="alert">Couldn’t load more.</span>}
    </div>
  )
}
