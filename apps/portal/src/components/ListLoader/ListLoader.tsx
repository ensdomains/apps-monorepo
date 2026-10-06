import { cn } from '@/lib/utils'

export type ListLoaderProps = {
  /** Rows on screen. */
  readonly shown: number
  /** Rows the list has in all, or `undefined` while the source can't say. */
  readonly total: number | undefined
  /** Whether `More` and `All` have anything left to reveal. */
  readonly canShowMore: boolean
  /** Where a fetch for more rows stands. Client-side lists stay `idle`. */
  readonly status: 'idle' | 'loading' | 'error'
  readonly onMore: () => void
  readonly onAll: () => void
  readonly className?: string
}

const ACTION_CLASS_NAME =
  'cursor-pointer underline underline-offset-2 hover:text-foreground disabled:cursor-default disabled:no-underline disabled:opacity-60'

/**
 * The one control every long list ends with: `Showing X of Y · More · All`.
 *
 * `More` doubles what is shown and `All` shows the rest, so the copy never
 * quotes a page size and reads the same on a list of 12 and a list of 1234.
 * Renders nothing once the whole list is on screen. State comes from
 * `useListLoader`.
 */
export const ListLoader = ({
  shown,
  total,
  canShowMore,
  status,
  onMore,
  onAll,
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
            className={ACTION_CLASS_NAME}
          >
            More
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onAll}
            disabled={status === 'loading'}
            className={ACTION_CLASS_NAME}
          >
            All
          </button>
        </>
      )}
      {status === 'loading' && <span role="status">Loading…</span>}
      {/* The rows already shown stay; `More` and `All` double as the retry. */}
      {status === 'error' && <span role="alert">Couldn’t load more.</span>}
    </div>
  )
}
