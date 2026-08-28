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
 * Unwraps each page's `Result` — value out, tagged error thrown — so `error` on
 * the hook is the tagged error rather than a rejected `Result`.
 *
 * That unwrap is the only reason this exists, and it has to happen here rather
 * than at the call site: TypeScript cannot infer an error type from a function
 * that *throws*, so calling `infiniteQueryOptions` directly collapses `TError`
 * to `Error` — whose `cause` is `unknown` — and every caller loses the typed
 * cause it branches on. Taking a `Result`-returning `queryFn` is what keeps
 * `TError` inferable, exactly as `resultQueryOptions` does for a single page.
 *
 * Everything else — page params, the `DataTag` on the returned key — is
 * `infiniteQueryOptions`' own job and passes straight through.
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
