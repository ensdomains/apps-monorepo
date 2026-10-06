import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { match } from 'ts-pattern'
import { type FetchMoreResult, fetchUntil } from './fetchUntil'
import type { ListLoaderProps } from './ListLoader'

type UseListLoaderParameters = {
  /** How many rows the list opens with. Each list picks its own. */
  readonly initialCount: number
  /** Rows in memory: the whole list, or the pages fetched so far. */
  readonly loaded: number
  /**
   * How many rows the list has in all. Leave out when the source can't say;
   * the count is then left off until the last page arrives.
   */
  readonly total?: number
  /** Server-paged lists: whether another page can be fetched. */
  readonly hasMore?: boolean
  /** Server-paged lists: fetches the next page; rejects when it fails. */
  readonly fetchMore?: () => Promise<FetchMoreResult>
}

/**
 * The state behind {@link ListLoader}: how many rows to render, and what
 * `More` and `All` do.
 *
 * Works for both kinds of list. A client-side list hands over everything it
 * has and this only decides how much of it renders. A server-paged list also
 * passes `hasMore` and `fetchMore`, and showing more fetches however many
 * pages that takes.
 *
 * Render `rows.slice(0, shown)` and spread `loader` onto `ListLoader`.
 */
export const useListLoader = ({
  initialCount,
  loaded,
  total,
  hasMore = false,
  fetchMore,
}: UseListLoaderParameters) => {
  const [target, setTarget] = useState(initialCount)

  // A mutation rather than the query's own flags: one `More` can span several
  // page fetches, and the query reports idle in the gap between two of them.
  const fetching = useMutation({ mutationFn: fetchUntil })

  const shown = Math.min(target, loaded)

  const showUpTo = (next: number) => {
    setTarget(next)
    if (fetchMore && hasMore && next > loaded)
      fetching.mutate({ target: next, loaded, hasMore, fetchMore })
  }

  return {
    shown,
    loader: {
      shown,
      // Once nothing is left to fetch, what is loaded is the total.
      total: total ?? (hasMore ? undefined : loaded),
      canShowMore: shown < loaded || hasMore,
      status: match(fetching)
        .returnType<ListLoaderProps['status']>()
        .with({ isPending: true }, () => 'loading')
        .with({ isError: true }, () => 'error')
        .otherwise(() => 'idle'),
      // No page size in the copy, so doubling is the whole contract. A list
      // showing nothing yet has nothing to double; it opens at its initial count.
      onMore: () => showUpTo(shown > 0 ? shown * 2 : initialCount),
      onAll: () => showUpTo(Number.POSITIVE_INFINITY),
    } satisfies ListLoaderProps,
  }
}
