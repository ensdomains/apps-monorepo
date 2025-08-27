import type {
  DataTag,
  DefinedInitialDataOptions,
  InitialDataFunction,
  OmitKeyof,
  QueryFunctionContext,
  SkipToken,
  UndefinedInitialDataOptions,
  UnusedSkipTokenOptions,
  UseQueryOptions,
} from '@tanstack/react-query'
import type { Result, ResultAsync } from 'neverthrow'

export type ResultError = { _tag: string }
export type GenericQueryKey = readonly [string, Record<string, unknown>?]

export type NonUndefinedGuard<T> = T extends undefined ? never : T

export type UseResultQueryOptions<
  TQueryFnData,
  TError extends ResultError,
  TData = TQueryFnData,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
> = OmitKeyof<
  UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  'queryFn'
> & {
  queryFn?: ResultQueryFunction<TQueryFnData, TError, TQueryKey> | SkipToken
}

export type UndefinedInitialDataResultOptions<
  TQueryFnData,
  TError extends ResultError,
  TData = TQueryFnData,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
> = UseResultQueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
  initialData?:
    | undefined
    | InitialDataFunction<NonUndefinedGuard<TQueryFnData>>
    | NonUndefinedGuard<TQueryFnData>
}

export type UnusedSkipTokenResultOptions<
  TQueryFnData,
  TError extends ResultError,
  TData = TQueryFnData,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
> = OmitKeyof<
  UseResultQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  'queryFn'
> & {
  queryFn?: Exclude<
    UseResultQueryOptions<TQueryFnData, TError, TData, TQueryKey>['queryFn'],
    SkipToken | undefined
  >
}

export type DefinedInitialDataResultOptions<
  TQueryFnData,
  TError extends ResultError,
  TData = TQueryFnData,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
> = Omit<
  UseResultQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  'queryFn'
> & {
  initialData:
    | NonUndefinedGuard<TQueryFnData>
    | (() => NonUndefinedGuard<TQueryFnData>)
  queryFn?: ResultQueryFunction<TQueryFnData, TError, TQueryKey>
}

export type ResultQueryFunction<
  TData,
  TError extends ResultError,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
  TPageParam = never,
> = (
  context: QueryFunctionContext<TQueryKey, TPageParam>,
) => Result<TData, TError> | ResultAsync<TData, TError>

export function resultQueryOptions<
  TQueryFnData,
  TError extends ResultError,
  TData = TQueryFnData,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
>(
  options: DefinedInitialDataResultOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey
  >,
): DefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>
}
export function resultQueryOptions<
  TQueryFnData,
  TError extends ResultError,
  TData = TQueryFnData,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
>(
  options: UnusedSkipTokenResultOptions<TQueryFnData, TError, TData, TQueryKey>,
): UnusedSkipTokenOptions<TQueryFnData, TError, TData, TQueryKey> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>
}
export function resultQueryOptions<
  TQueryFnData,
  TError extends ResultError,
  TData = TQueryFnData,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
>(
  options: UndefinedInitialDataResultOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey
  >,
): UndefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>
}

export function resultQueryOptions({
  gcTime: rawGcTime,
  staleTime: rawStaleTime,
  queryFn: rawQueryFn,
  queryKey,
  ...rest
}: UseResultQueryOptions<unknown, ResultError>): UseQueryOptions<
  unknown,
  ResultError,
  unknown,
  GenericQueryKey
> {
  const queryFn =
    typeof rawQueryFn === 'function'
      ? (context: QueryFunctionContext<GenericQueryKey>) =>
          rawQueryFn(context).match(
            (value) => value,
            (error) => {
              throw error
            },
          )
      : rawQueryFn

  return {
    ...rest,
    queryFn,
    queryKey,
  }
}
