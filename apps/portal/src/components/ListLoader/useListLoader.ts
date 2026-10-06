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
  /**
   * Names the list being shown, e.g. the route's name or address. A route that
   * moves to another one keeps this hook mounted, so without it the next list
   * would open at whatever the last one had been expanded to.
   */
  readonly resetKey?: string
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
  resetKey,
}: UseListLoaderParameters) => {
  // What the reader asked for, and for which list. A choice made on another
  // list doesn't carry over: this one opens at its own initial count.
  const [choice, setChoice] = useState<{
    readonly resetKey: string | undefined
    readonly target: number
  } | null>(null)
  const target =
    choice && choice.resetKey === resetKey ? choice.target : initialCount

  // A mutation rather than the query's own flags: one `More` can span several
  // page fetches, and the query reports idle in the gap between two of them.
  const fetching = useMutation({
    mutationFn: ({
      resetKey: _resetKey,
      ...params
    }: Parameters<typeof fetchUntil>[0] & {
      readonly resetKey: string | undefined
    }) => fetchUntil(params),
  })
  // A fetch started for another list says nothing about this one.
  const isFetchForThisList = fetching.variables?.resetKey === resetKey

  const shown = Math.min(target, loaded)

  const showUpTo = (next: number) => {
    setChoice({ resetKey, target: next })
    if (fetchMore && hasMore && next > loaded)
      fetching.mutate({ target: next, loaded, hasMore, fetchMore, resetKey })
  }

  return {
    shown,
    loader: {
      shown,
      // Once nothing is left to fetch, what is loaded is the total.
      total: total ?? (hasMore ? undefined : loaded),
      canShowMore: shown < loaded || hasMore,
      status: match({ ...fetching, isFetchForThisList })
        .returnType<ListLoaderProps['status']>()
        .with({ isFetchForThisList: false }, () => 'idle')
        .with({ isPending: true }, () => 'loading')
        .with({ isError: true }, () => 'error')
        .otherwise(() => 'idle'),
      // No page size in the copy, so doubling is the whole contract. A list
      // showing nothing has nothing to double, so it opens at its initial
      // count — or at one row, so `More` always reveals something.
      onMore: () => showUpTo(Math.max(shown * 2, initialCount, 1)),
      onAll: () => showUpTo(Number.POSITIVE_INFINITY),
    } satisfies ListLoaderProps,
  }
}
