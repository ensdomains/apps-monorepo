import type {
  DataTag,
  InfiniteData,
  QueryFunctionContext,
  QueryKey,
  UndefinedInitialDataInfiniteOptions,
  UseInfiniteQueryOptions,
} from '@tanstack/react-query'
import type { ResultQueryFunction } from './query'
import type { ResultError } from './shared'

/**
 * The paginated sibling of `UseResultQueryOptions`: everything
 * `useInfiniteQuery` takes, but with a `queryFn` that returns a
 * `Result`/`ResultAsync` instead of a bare value.
 *
 * `ResultQueryFunction` already carries a `TPageParam` generic that
 * `resultQueryOptions` leaves at `never` — this is what supplies it, so the
 * `queryFn` sees a typed `pageParam` in its context.
 */
export type UseResultInfiniteQueryOptions<
  TQueryFnData,
  TError extends ResultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> = Omit<
  UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
  'queryFn'
> & {
  queryFn: ResultQueryFunction<TQueryFnData, TError, TQueryKey, TPageParam>
}

/**
 * `resultQueryOptions` for a cursor-paginated feed.
 *
 * Unwraps each page's `Result` the same way — value out, tagged error thrown —
 * so `error` on the hook is the tagged error and not a rejected `Result`. Page
 * plumbing (`initialPageParam`, `getNextPageParam`) passes through untouched.
 */
export function resultInfiniteQueryOptions<
  TQueryFnData,
  TError extends ResultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: UseResultInfiniteQueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam
  >,
): UndefinedInitialDataInfiniteOptions<
  TQueryFnData,
  TError,
  TData,
  TQueryKey,
  TPageParam
> & {
  queryKey: DataTag<TQueryKey, InfiniteData<TQueryFnData>, TError>
}

export function resultInfiniteQueryOptions({
  queryFn: rawQueryFn,
  ...rest
}: UseResultInfiniteQueryOptions<
  unknown,
  ResultError,
  InfiniteData<unknown>,
  QueryKey,
  unknown
>) {
  return {
    ...rest,
    queryFn: (context: QueryFunctionContext<QueryKey, unknown>) =>
      rawQueryFn(context).match(
        (value) => value,
        (error) => {
          throw error
        },
      ),
  }
}
