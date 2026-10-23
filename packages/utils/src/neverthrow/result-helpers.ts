import { err, ok, type Result, type ResultAsync } from 'neverthrow'

/**
 * Type utilities for inferring Result types
 */
export type InferOkTypes<R> =
  R extends Result<infer T, unknown>
    ? T
    : R extends ResultAsync<infer T, unknown>
      ? T
      : never

export type InferErrTypes<R> =
  R extends Result<unknown, infer E>
    ? E
    : R extends ResultAsync<unknown, infer E>
      ? E
      : never

/**
 * Retrieves the first item from an array or returns a fallback result.
 *
 * This utility is useful for database queries where you expect at most one result
 * but want to handle the "not found" case gracefully.
 *
 * @example
 * ```typescript
 * const users = await db.query.users.findMany({ where: eq(users.email, email) })
 * const user = getFirstOrFallback(
 *   () => error({ code: 'USER_NOT_FOUND', message: 'User not found' })
 * )(users)
 *
 * if (user.isErr()) {
 *   console.log(user.error.code) // 'USER_NOT_FOUND'
 * } else {
 *   console.log(user.value.name) // User object
 * }
 * ```
 *
 * @param fallback - Result to return if array is empty, or function that creates the fallback
 * @returns Function that takes an array and returns first item or fallback
 */
export function getFirstOrFallback<
  TData,
  TFallback extends Result<TData, unknown>,
>(fallback: TFallback | ((data: TData[]) => TFallback)) {
  return (array: TData[]) => {
    const item = array.at(0)
    if (!item) {
      return typeof fallback === 'function' ? fallback(array) : fallback
    }

    return ok(item)
  }
}

/**
 * Improved version of fromThrowable that handles functions with generics better
 * @param fn - Function to wrap
 * @param errorFn - Function to convert errors to your error type
 * @returns Function that wraps the function and converts errors to your error type
 */
export function fromThrowableV2<A extends readonly unknown[], R, E>(
  fn: (...args: A) => R,
  errorFn?: (err: unknown) => E,
): (...args: A) => Result<R, E> {
  return (...args) => {
    try {
      return ok(fn(...args))
    } catch (error) {
      return err(errorFn ? errorFn(error) : (error as E))
    }
  }
}
