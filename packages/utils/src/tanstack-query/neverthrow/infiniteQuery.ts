import {
  type InfiniteData,
  infiniteQueryOptions,
  type QueryKey,
  type UseInfiniteQueryOptions,
} from '@tanstack/react-query'
import type { ResultQueryFunction } from './query'
import type { ResultError } from './shared'

/**
 * `resultQueryOptions` for a cursor-paginated feed.
 *
 * The `Result` unwrap has to happen here rather than at the call site: TypeScript
 * cannot infer an error type from a function that *throws*, so calling
 * `infiniteQueryOptions` directly collapses `TError` to `Error` — whose `cause`
 * is `unknown` — and every caller loses the typed cause it branches on.
 */
export const resultInfiniteQueryOptions = <
  TQueryFnData,
  TError extends ResultError,
  TQueryKey extends QueryKey,
  TPageParam,
>({
  queryFn,
  ...rest
}: Omit<
  UseInfiniteQueryOptions<
    TQueryFnData,
    TError,
    InfiniteData<TQueryFnData>,
    TQueryKey,
    TPageParam
  >,
  'queryFn'
> & {
  queryFn: ResultQueryFunction<TQueryFnData, TError, TQueryKey, TPageParam>
}) =>
  infiniteQueryOptions<
    TQueryFnData,
    TError,
    InfiniteData<TQueryFnData>,
    TQueryKey,
    TPageParam
  >({
    ...rest,
    queryFn: (context) =>
      queryFn(context).match(
        (value) => value,
        (error) => {
          throw error
        },
      ),
  })
