import { Effect, Exit } from 'effect'
import { runtime, type RuntimeContext } from './runtime'
import {
  fromPromise,
  type ActorRefFromLogic,
  type ActorSystem,
  type EventObject,
  type NonReducibleUnknown,
  type PromiseActorLogic,
} from 'xstate'

/**
 * An actor logic creator which returns promise logic that wraps an Effect program.
 * This allows integrating Effect programs with XState actors while maintaining
 * proper error handling and resource management.
 *
 * Actors created from effect actor logic can:
 *
 * - Emit events during execution
 * - Output the result of the Effect program as an Exit value
 * - Properly handle Effect errors and interruptions
 *
 * Sending events to effect actors will have no effect.
 *
 * @example
 *
 * ```ts
 * const effectLogic = fromEffect((input, { emit }) => {
 *   return pipe(
 *     Effect.tryPromise(() => fetch('https://example.com/...')),
 *     Effect.flatMap((data) => Effect.promise(() => data.json())),
 *     Effect.tap((result) => emit({ type: 'DATA_RECEIVED', data: result }))
 *   );
 * });
 *
 * const effectActor = createActor(effectLogic);
 * effectActor.subscribe((snapshot) => {
 *   console.log(snapshot);
 * });
 * effectActor.start();
 * // => {
 * //   output: undefined,
 * //   status: 'active'
 * //   ...
 * // }
 *
 * // After effect completes
 * // => {
 * //   output: Exit.succeed({ ... }),
 * //   status: 'done',
 * //   ...
 * // }
 * ```
 *
 * @param effectCreator A function which returns an Effect program, and accepts:
 *   - `input` - Data that was provided to the effect actor
 *   - `ctx` - An object containing:
 *     - `emit` - Function to emit events during execution
 *     - `self` - The parent actor reference
 *     - `signal` - AbortSignal for cancellation
 *     - `system` - The actor system to which the effect actor belongs
 *
 * @see {@link https://effect.website/docs/guides/essentials/creating-effects | Effect docs} for more information about creating effects
 */
export const fromEffect = <
  A,
  E,
  R extends RuntimeContext,
  TInput = NonReducibleUnknown,
  TEmitted extends EventObject = EventObject,
>(
  effectCreator: (
    input: TInput,
    ctx: {
      emit: (event: TEmitted) => Effect.Effect<void>
      self: ActorRefFromLogic<
        PromiseActorLogic<Exit.Exit<A, E>, NoInfer<TInput>, NoInfer<TEmitted>>
      >
      signal: AbortSignal
      /** The actor system to which the promise actor belongs */
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      system: ActorSystem<any>
    },
  ) => Effect.Effect<A, E, R>,
) =>
  fromPromise<Exit.Exit<A, E>, TInput>(
    ({ input, emit, self, signal, system }) =>
      runtime.runPromiseExit(
        effectCreator(input, {
          emit: (event) => Effect.sync(() => emit(event)),
          self: self as ActorRefFromLogic<
            PromiseActorLogic<
              Exit.Exit<A, E>,
              NoInfer<TInput>,
              NoInfer<TEmitted>
            >
          >,
          signal,
          system,
        }),
        { signal },
      ),
  )

export const asSuccess = <A, E>(exit: Exit.Exit<A, E>) => {
  if (Exit.isSuccess(exit)) {
    return exit.value
  }

  throw new Error('Exit is not a success')
}

export const asFailure = <A, E>(exit: Exit.Exit<A, E>) => {
  if (Exit.isFailure(exit)) {
    return exit.cause
  }

  throw new Error('Exit is not a failure')
}
