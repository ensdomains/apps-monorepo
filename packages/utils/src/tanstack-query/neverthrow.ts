import type {
  DataTag,
  DefinedInitialDataOptions,
  InitialDataFunction,
  OmitKeyof,
  QueryFunctionContext,
  QueryKey,
  SkipToken,
  UndefinedInitialDataOptions,
  UnusedSkipTokenOptions,
  UseMutationOptions,
  UseQueryOptions,
} from '@tanstack/react-query'
import type { Result, ResultAsync } from 'neverthrow'

export type ResultError = { _tag: string }

export type NonUndefinedGuard<T> = T extends undefined ? never : T

export type UseResultQueryOptions<
  TQueryFnData,
  TError extends ResultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
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
  TQueryKey extends QueryKey = QueryKey,
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
  TQueryKey extends QueryKey = QueryKey,
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
  TQueryKey extends QueryKey = QueryKey,
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
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = never,
> = (
  context: QueryFunctionContext<TQueryKey, TPageParam>,
) => Result<TData, TError> | ResultAsync<TData, TError>

export function resultQueryOptions<
  TQueryFnData,
  TError extends ResultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
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
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UnusedSkipTokenResultOptions<TQueryFnData, TError, TData, TQueryKey>,
): UnusedSkipTokenOptions<TQueryFnData, TError, TData, TQueryKey> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>
}
export function resultQueryOptions<
  TQueryFnData,
  TError extends ResultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
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
  QueryKey
> {
  const queryFn =
    typeof rawQueryFn === 'function'
      ? (context: QueryFunctionContext<QueryKey>) =>
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

export type ResultMutationFunction<
  TData,
  TError extends ResultError,
  TVariables = void,
> = (
  variables: TVariables,
) => Result<TData, TError> | ResultAsync<TData, TError>

export type UseResultMutationOptions<
  TData,
  TError extends ResultError,
  TVariables = void,
  TContext = unknown,
> = OmitKeyof<
  UseMutationOptions<TData, TError, TVariables, TContext>,
  'mutationFn'
> & {
  mutationFn?: ResultMutationFunction<TData, TError, TVariables>
}

export function resultMutationOptions<
  TData,
  TError extends ResultError,
  TVariables = void,
  TContext = unknown,
>({
  mutationFn: rawMutationFn,
  ...rest
}: UseResultMutationOptions<
  TData,
  TError,
  TVariables,
  TContext
>): UseMutationOptions<TData, TError, TVariables, TContext> {
  const mutationFn:
    | UseMutationOptions<TData, TError, TVariables, TContext>['mutationFn']
    | undefined =
    typeof rawMutationFn === 'function'
      ? async (variables: TVariables) =>
          await rawMutationFn(variables).match(
            (value) => value,
            (error) => {
              throw error
            },
          )
      : undefined

  return {
    ...rest,
    mutationFn,
  }
}
