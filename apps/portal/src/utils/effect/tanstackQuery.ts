/**
 * Inspired by https://youtu.be/zl4w3BQAoJM
 * https://github.com/lucas-barake/react-interview-test-queues-and-streams/tree/solution
 */

import {
  QueryClient,
  type QueryFunction,
  type QueryFunctionContext,
  skipToken,
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query'
import { Duration, Effect, pipe } from 'effect'
import type { DurationInput } from 'effect/Duration'
import React from 'react'
import { runtime, RuntimeContext } from './runtime'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Duration.toMillis('1 minute'),
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

const effectRunner =
  <A, E, R extends RuntimeContext>(span: string, signal?: AbortSignal) =>
  (effect: Effect.Effect<A, E, R>): Promise<A> =>
    runtime.runPromise(
      pipe(
        effect,
        Effect.withSpan(span),
        Effect.tapErrorCause(Effect.logError),
      ),
      {
        signal,
      },
    )

// /**
//  * @internal
//  */
// const useRunner = () => {
//   // const runtime = useRuntime()
//   return React.useCallback(
//     <A, E, R extends RuntimeContext>(span: string) =>
//       (effect: Effect.Effect<A, E, R>): Promise<A> =>
//         effect.pipe(
//           Effect.withSpan(span),
//           Effect.tapErrorCause(Effect.logError),
//           runtime.runPromise,
//         ),
//     [runtime.runPromise],
//   )
// }

type GenericQueryKey = readonly [string, Record<string, unknown>?]
type EffectfulError = { _tag: string }

type EffectfulMutationOptions<
  TData,
  TError extends EffectfulError,
  TVariables,
  R extends RuntimeContext,
> = Omit<
  UseMutationOptions<TData, TError, TVariables>,
  | 'mutationFn'
  | 'onSuccess'
  | 'onError'
  | 'onSettled'
  | 'onMutate'
  | 'retry'
  | 'retryDelay'
> & {
  mutationKey: GenericQueryKey
  mutationFn: (variables: TVariables) => Effect.Effect<TData, TError, R>
}

/**
 * React hook for running an Effect as a TanStack Mutation.
 *
 * @template TData The type of data returned by the mutation
 * @template TError The type of error thrown by the effect
 * @template TVariables The type of variables accepted by the mutation
 * @template R The runtime context required by the effect
 * @param options The effectful mutation options
 * @returns The result of the mutation
 */
export function useEffectMutation<
  TData,
  TError extends EffectfulError,
  TVariables,
  R extends RuntimeContext,
>(
  options: EffectfulMutationOptions<TData, TError, TVariables, R>,
): UseMutationResult<TData, TError, TVariables> {
  const [spanName] = options.mutationKey

  const mutationFn = React.useCallback(
    (variables: TVariables) =>
      pipe(options.mutationFn(variables), effectRunner(spanName)),
    [effectRunner, spanName, options],
  )

  return useMutation<TData, TError, TVariables>({
    ...options,
    mutationFn,
  })
}

type EffectfulQueryFunction<
  TData,
  TError,
  R extends RuntimeContext,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
  TPageParam = never,
> = (
  context: QueryFunctionContext<TQueryKey, TPageParam>,
) => Effect.Effect<TData, TError, R>

type EffectfulQueryOptions<
  TData,
  TError,
  R extends RuntimeContext,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
  TPageParam = never,
> = Omit<
  UseQueryOptions<TData, TError, TData, TQueryKey>,
  'queryKey' | 'queryFn' | 'retry' | 'retryDelay' | 'staleTime' | 'gcTime'
> & {
  queryKey: TQueryKey
  queryFn:
    | EffectfulQueryFunction<TData, TError, R, TQueryKey, TPageParam>
    | typeof skipToken
  staleTime?: DurationInput
  gcTime?: DurationInput
}

/**
 * React hook for running an Effect as a TanStack Query.
 *
 * @template TData The type of data returned by the query
 * @template TError The type of error thrown by the effect
 * @template R The runtime context required by the effect
 * @template TQueryKey The type of the query key
 * @param options The effectful query options
 * @returns The result of the query
 */
export function useEffectQuery<
  TData,
  TError extends EffectfulError,
  R extends RuntimeContext,
  TQueryKey extends GenericQueryKey = GenericQueryKey,
>({
  gcTime,
  staleTime,
  ...options
}: EffectfulQueryOptions<TData, TError, R, TQueryKey>): UseQueryResult<
  TData,
  TError
> {
  const [spanName] = options.queryKey

  const queryFn: QueryFunction<TData, TQueryKey> = React.useCallback(
    (context: QueryFunctionContext<TQueryKey>) =>
      pipe(
        (
          options.queryFn as EffectfulQueryFunction<TData, TError, R, TQueryKey>
        )(context),
        effectRunner(spanName, context.signal),
      ),
    [effectRunner, spanName, options],
  )

  const queryOptions: UseQueryOptions<TData, TError, TData, TQueryKey> = {
    ...options,
    queryFn: options.queryFn === skipToken ? skipToken : queryFn,
    ...(staleTime !== undefined && { staleTime: Duration.toMillis(staleTime) }),
    ...(gcTime !== undefined && { gcTime: Duration.toMillis(gcTime) }),
  }

  return useQuery(queryOptions)
}

type QueryKey<TKey extends string, TVariables = void> = TVariables extends void
  ? readonly [TKey]
  : readonly [TKey, TVariables]

/**
 * Creates a type-safe query key factory that can be used with or without variables
 * @template TKey The string literal type for the query key
 * @template TVariables Optional variables type. If not provided, the factory will not accept variables
 * @param key The query key string
 * @returns A function that creates a query key tuple
 *
 * @example Without variables:
 * ```typescript
 * const userKey = createQueryKey("user");
 * const key = userKey(); // returns ["user"]
 * ```
 *
 * @example With variables:
 * ```typescript
 * type UserVars = { id: string };
 * const userKey = createQueryKey<"user", UserVars>("user");
 * const key = userKey({ id: "123" }); // returns ["user", { id: "123" }]
 * ```
 */
export function createQueryKey<TKey extends string, TVariables = void>(
  key: TKey,
) {
  return ((variables?: TVariables) =>
    variables === undefined
      ? ([key] as const)
      : ([key, variables] as const)) as TVariables extends void
    ? () => QueryKey<TKey>
    : (variables: TVariables) => QueryKey<TKey, TVariables>
}

// /**
//  * Returns a TanStack Query options object with effectful logic for use in custom hooks or advanced scenarios.
//  *
//  * @template TData The type of data returned by the query
//  * @template TError The type of error thrown by the effect
//  * @template R The runtime context required by the effect
//  * @template TQueryKey The type of the query key
//  * @param options The effectful query options
//  * @returns The options object for use with TanStack Query's useQuery
//  *
//  * @example
//  * const options = effectQueryOptions({ ... });
//  * const result = useQuery(options);
//  */
// export function effectQueryOptions<
//   TData,
//   TError extends EffectfulError,
//   R extends RuntimeContext,
//   TQueryKey extends GenericQueryKey = GenericQueryKey,
// >({
//   gcTime,
//   staleTime,
//   ...options
// }: EffectfulQueryOptions<TData, TError, R, TQueryKey>): UseQueryOptions<
//   TData,
//   TError,
//   TData,
//   TQueryKey
// > {
//   const [spanName] = options.queryKey

//   const queryFn: QueryFunction<TData, TQueryKey> = (
//     context: QueryFunctionContext<TQueryKey>,
//   ) =>
//     pipe(
//       (options.queryFn as EffectfulQueryFunction<TData, TError, R, TQueryKey>)(
//         context,
//       ),
//       effectRunner(spanName, context.signal),
//     )

//   return {
//     retry: false,
//     refetchOnWindowFocus: false,
//     ...options,
//     queryFn: options.queryFn === skipToken ? skipToken : queryFn,
//     ...(staleTime !== undefined && { staleTime: Duration.toMillis(staleTime) }),
//     ...(gcTime !== undefined && { gcTime: Duration.toMillis(gcTime) }),
//   }
// }

/**
 * Returns a TanStack Mutation options object with effectful logic for use in custom hooks or advanced scenarios.
 *
 * @template TData The type of data returned by the mutation
 * @template TError The type of error thrown by the effect
 * @template TVariables The type of variables accepted by the mutation
 * @template R The runtime context required by the effect
 * @param options The effectful mutation options
 * @returns The options object for use with TanStack Query's useMutation
 *
 * @example
 * const options = effectMutationOptions({ ... });
 * const result = useMutation(options);
 */
export function effectMutationOptions<
  TData,
  TError extends EffectfulError,
  TVariables,
  R extends RuntimeContext,
>(
  options: EffectfulMutationOptions<TData, TError, TVariables, R>,
): UseMutationOptions<TData, TError, TVariables> {
  const [spanName] = options.mutationKey

  const mutationFn = (variables: TVariables) =>
    pipe(options.mutationFn(variables), effectRunner(spanName))

  return {
    ...options,
    mutationFn,
  }
}
