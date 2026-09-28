import { TaggedError } from '@ens-apps/utils/neverthrow'
import { ok, type Result, ResultAsync } from 'neverthrow'
import { backendAuthStore } from '@/utils/backend-client'

export class NotificationSessionChangedError extends TaggedError(
  'NotificationSessionChangedError',
) {}

/** Keep an unfinished browser prompt bound to the login that started it. */
export const captureNotificationSession = () => {
  const initial = backendAuthStore.get().context
  const matches = (current: typeof initial) =>
    !!initial.authKey &&
    !!initial.address &&
    current.authKey === initial.authKey &&
    current.address?.toLowerCase() === initial.address.toLowerCase() &&
    current.apiBaseUrlOverride === initial.apiBaseUrlOverride
  let changed = !matches(initial)
  const subscription = backendAuthStore.subscribe(({ context }) => {
    if (!matches(context)) changed = true
  })
  const validate = () =>
    !changed && matches(backendAuthStore.get().context)
      ? ok(undefined)
      : new NotificationSessionChangedError({
          message: 'Your sign-in changed. Start this notification setup again.',
        }).toErr()

  return {
    validate,
    assertCurrent: () => {
      const result = validate()
      if (result.isErr()) throw result.error
    },
    dispose: () => subscription.unsubscribe(),
  }
}

export const withNotificationSession = <T, E>(
  operation: (
    session: ReturnType<typeof captureNotificationSession>,
  ) => PromiseLike<Result<T, E>>,
) => {
  const session = captureNotificationSession()
  // ResultFn stops at the first yielded error without closing its generator.
  // Release the store listener outside that generator, on every outcome.
  return new ResultAsync(
    Promise.resolve()
      .then(() => operation(session))
      .finally(() => session.dispose()),
  )
}
