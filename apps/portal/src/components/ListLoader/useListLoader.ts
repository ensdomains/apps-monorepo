import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { match } from 'ts-pattern'
import { type FetchMoreResult, fetchUntil } from './fetchUntil'
import type { ListLoaderProps } from './ListLoader'

type UseListLoaderParameters = {
  readonly initialCount: number
  readonly loaded: number
  readonly total?: number
  readonly hasMore?: boolean
  readonly fetchMore?: () => Promise<FetchMoreResult>
  /** Identifies the list; a new key reopens it at `initialCount`. */
  readonly resetKey?: string
}

/** State for `ListLoader`: render `rows.slice(0, shown)` and spread `loader`. */
export const useListLoader = ({
  initialCount,
  loaded,
  total,
  hasMore = false,
  fetchMore,
  resetKey,
}: UseListLoaderParameters) => {
  const [choice, setChoice] = useState<{
    readonly resetKey: string | undefined
    readonly target: number
  } | null>(null)
  const target =
    choice && choice.resetKey === resetKey ? choice.target : initialCount

  const fetching = useMutation({
    mutationFn: ({
      resetKey: _resetKey,
      ...params
    }: Parameters<typeof fetchUntil>[0] & {
      readonly resetKey: string | undefined
    }) => fetchUntil(params),
  })
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
      total: total ?? (hasMore ? undefined : loaded),
      canShowMore: shown < loaded || hasMore,
      status: match({ ...fetching, isFetchForThisList })
        .returnType<ListLoaderProps['status']>()
        .with({ isFetchForThisList: false }, () => 'idle')
        .with({ isPending: true }, () => 'loading')
        .with({ isError: true }, () => 'error')
        .otherwise(() => 'idle'),
      onMore: () => showUpTo(Math.max(shown * 2, initialCount, 1)),
      onAll: () => showUpTo(Number.POSITIVE_INFINITY),
    } satisfies ListLoaderProps,
  }
}
