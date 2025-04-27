import {
  queryOptions,
  type DataTag,
  type DefinedInitialDataOptions,
  type InitialDataFunction,
  type OmitKeyof,
  type QueryFunction,
  type QueryFunctionContext,
  type QueryKey,
  type SkipToken,
  type StaleTime,
  type UndefinedInitialDataOptions,
  type UnusedSkipTokenOptions,
  type UseQueryOptions,
} from '@tanstack/react-query'
import type { RuntimeContext } from '@/utils/effect/runtime'
import { Duration, pipe, type Effect } from 'effect'
import type { DurationInput } from 'effect/Duration'
import { effectRunner } from './effect'

export type EffectfulError = { _tag: string }
export type GenericQueryKey = readonly [string, Record<string, unknown>?]

export type NonUndefinedGuard<T> = T extends undefined ? never : T

export type UseEffectfulQueryOptions<
  TQueryFnData,
  TError extends EffectfulError,
  R extends RuntimeContext,
  TData = TQueryFnData,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
> = OmitKeyof<
  UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  'queryFn' | 'gcTime' | 'staleTime' | 'retry' | 'retryDelay'
> & {
  queryFn?:
    | EffectfulQueryFunction<TQueryFnData, TError, R, TQueryKey>
    | SkipToken
  staleTime?:
    | DurationInput
    | StaleTime<TQueryFnData, TError, TQueryFnData, TQueryKey>
  gcTime?: DurationInput
}

export type UndefinedInitialDataEffectfulOptions<
  TQueryFnData,
  TError extends EffectfulError,
  R extends RuntimeContext,
  TData = TQueryFnData,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
> = UseEffectfulQueryOptions<TQueryFnData, TError, R, TData, TQueryKey> & {
  initialData?:
    | undefined
    | InitialDataFunction<NonUndefinedGuard<TQueryFnData>>
    | NonUndefinedGuard<TQueryFnData>
}

export type UnusedSkipTokenEffectfulOptions<
  TQueryFnData,
  TError extends EffectfulError,
  R extends RuntimeContext,
  TData = TQueryFnData,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
> = OmitKeyof<
  UseEffectfulQueryOptions<TQueryFnData, TError, R, TData, TQueryKey>,
  'queryFn'
> & {
  queryFn?: Exclude<
    UseEffectfulQueryOptions<
      TQueryFnData,
      TError,
      R,
      TData,
      TQueryKey
    >['queryFn'],
    SkipToken | undefined
  >
}

export type DefinedInitialDataEffectfulOptions<
  TQueryFnData,
  TError extends EffectfulError,
  R extends RuntimeContext,
  TData = TQueryFnData,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
> = Omit<
  UseEffectfulQueryOptions<TQueryFnData, TError, R, TData, TQueryKey>,
  'queryFn'
> & {
  initialData:
    | NonUndefinedGuard<TQueryFnData>
    | (() => NonUndefinedGuard<TQueryFnData>)
  queryFn?: EffectfulQueryFunction<TQueryFnData, TError, R, TQueryKey>
}

export type EffectfulQueryFunction<
  TData,
  TError extends EffectfulError,
  R extends RuntimeContext,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
  TPageParam = never,
> = (
  context: QueryFunctionContext<TQueryKey, TPageParam>,
) => Effect.Effect<TData, TError, R>

export function effectQueryOptions<
  TQueryFnData,
  TError extends EffectfulError,
  R extends RuntimeContext,
  TData = TQueryFnData,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
>(
  options: DefinedInitialDataEffectfulOptions<
    TQueryFnData,
    TError,
    R,
    TData,
    TQueryKey
  >,
): DefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>
}
export function effectQueryOptions<
  TQueryFnData,
  TError extends EffectfulError,
  R extends RuntimeContext,
  TData = TQueryFnData,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
>(
  options: UnusedSkipTokenEffectfulOptions<
    TQueryFnData,
    TError,
    R,
    TData,
    TQueryKey
  >,
): UnusedSkipTokenOptions<TQueryFnData, TError, TData, TQueryKey> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>
}
export function effectQueryOptions<
  TQueryFnData,
  TError extends EffectfulError,
  R extends RuntimeContext,
  TData = TQueryFnData,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
>(
  options: UndefinedInitialDataEffectfulOptions<
    TQueryFnData,
    TError,
    R,
    TData,
    TQueryKey
  >,
): UndefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>
}

export function effectQueryOptions({
  gcTime: rawGcTime,
  staleTime: rawStaleTime,
  queryFn: rawQueryFn,
  queryKey,
  ...rest
}: UseEffectfulQueryOptions<
  unknown,
  EffectfulError,
  RuntimeContext
>): UseQueryOptions<unknown, EffectfulError, unknown, GenericQueryKey> {
  const [spanName] = queryKey

  const queryFn =
    typeof rawQueryFn === 'function'
      ? (context: QueryFunctionContext<GenericQueryKey>) =>
          pipe(rawQueryFn(context), effectRunner(spanName, context.signal))
      : rawQueryFn

  const gcTime =
    rawGcTime !== undefined ? Duration.toMillis(rawGcTime) : undefined
  const staleTime =
    typeof rawStaleTime === 'function'
      ? rawStaleTime
      : rawStaleTime !== undefined
        ? Duration.toMillis(rawStaleTime)
        : undefined

  return {
    retry: false,
    refetchOnWindowFocus: false,
    ...rest,
    queryFn,
    gcTime,
    staleTime,
    queryKey,
  }
}
