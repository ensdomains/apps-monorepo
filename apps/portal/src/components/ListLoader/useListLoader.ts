import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
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

/** Props for `ListLoader`; render `rows.slice(0, shown)` beside it. */
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

  const { mutate, isPending, isError } = useMutation({ mutationFn: fetchUntil })

  const abortRef = useRef<AbortController | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new list, or leaving the page, stops the fetch in flight
  useEffect(() => () => abortRef.current?.abort(), [resetKey])

  const shown = Math.min(target, loaded)

  const showUpTo = (next: number) => {
    setChoice({ resetKey, target: next })
    abortRef.current?.abort()
    if (!fetchMore || !hasMore || next <= loaded) return
    abortRef.current = new AbortController()
    mutate({
      target: next,
      loaded,
      hasMore,
      fetchMore,
      signal: abortRef.current.signal,
    })
  }

  const knownTotal = total ?? (hasMore ? undefined : loaded)
  const moreCount = Math.min(
    Math.max(shown * 2, initialCount, 1),
    knownTotal ?? Number.POSITIVE_INFINITY,
  )

  return {
    shown,
    moreCount,
    total: knownTotal,
    canShowMore: shown < loaded || hasMore,
    status: match({
      isCurrent: choice?.resetKey === resetKey,
      isPending,
      isError,
    })
      .returnType<ListLoaderProps['status']>()
      .with({ isCurrent: true, isPending: true }, () => 'loading')
      .with({ isCurrent: true, isError: true }, () => 'error')
      .otherwise(() => 'idle'),
    onMore: () => showUpTo(moreCount),
    onAll: () => showUpTo(Number.POSITIVE_INFINITY),
  } satisfies ListLoaderProps
}
