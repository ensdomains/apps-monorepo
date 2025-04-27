import { pipe, Effect } from 'effect';
import { runtime, type RuntimeContext } from '@/utils/effect/runtime';

export const effectRunner =
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